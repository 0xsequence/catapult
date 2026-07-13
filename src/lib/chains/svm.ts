import * as fs from 'fs/promises'
import {
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SendOptions,
  Signer,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import { Network } from '../types/network'
import {
  SvmAccountResult,
  SvmChainAdapter,
  SvmInstructionRequest,
  SvmProgramDeploymentRequest,
  SvmProgramDeploymentResult,
  SvmProgramUpgradeRequest,
  SvmTransactionOptions,
  SvmTransactionResult,
} from './types'

export const SVM_UPGRADEABLE_LOADER_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111')
export const SVM_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const SVM_ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

const BUFFER_METADATA_SIZE = 37
const PROGRAM_ACCOUNT_SIZE = 36
const PROGRAM_DATA_METADATA_SIZE = 45
const DEFAULT_PROGRAM_CHUNK_SIZE = 900

type SvmAdapterDependencies = {
  connection?: Connection
  signer?: Keypair
}

type SendResult = SvmTransactionResult & { signature: string }

export class SvmAdapter implements SvmChainAdapter {
  public readonly platform = 'svm' as const
  public readonly executionModel = 'svm' as const
  public readonly nativeCurrencySymbol = 'SOL'
  public readonly supportsNickMethod = false
  public readonly supportsRawSignedTransactions = false
  public readonly supportsEvmSignatures = false
  public readonly connection: Connection

  private readonly commitment: Commitment
  private readonly sendOptions: SendOptions
  private readonly programChunkSize: number
  private signer?: Keypair
  private genesisHashChecked = false

  constructor(
    private readonly network: Network,
    private readonly keypairPath?: string,
    dependencies: SvmAdapterDependencies = {}
  ) {
    const params = network.params || {}
    this.commitment = this.getCommitmentParam(params.commitment)
    this.sendOptions = {
      skipPreflight: params.skipPreflight === true,
      maxRetries: this.getOptionalPositiveInteger(params.maxRetries, 'maxRetries'),
      preflightCommitment: this.commitment,
    }
    this.programChunkSize = this.getOptionalPositiveInteger(params.programChunkSize, 'programChunkSize') || DEFAULT_PROGRAM_CHUNK_SIZE
    this.connection = dependencies.connection || new Connection(network.rpcUrl, this.commitment)
    this.signer = dependencies.signer
  }

  public getNetwork(): Network {
    return this.network
  }

  public async getSignerAddress(): Promise<string> {
    return (await this.getSigner()).publicKey.toBase58()
  }

  public async getSignerBalance(): Promise<bigint> {
    return this.getBalance(await this.getSignerAddress())
  }

  public formatNativeValue(value: bigint): string {
    const sign = value < 0n ? '-' : ''
    const absolute = value < 0n ? -value : value
    const unit = BigInt(LAMPORTS_PER_SOL)
    const whole = absolute / unit
    const fraction = (absolute % unit).toString().padStart(9, '0').replace(/0+$/, '')
    return `${sign}${whole.toString()}${fraction ? `.${fraction}` : ''}`
  }

  public isAddress(value: unknown): value is string {
    if (typeof value !== 'string') return false
    try {
      return new PublicKey(value).toBytes().length === 32
    } catch {
      return false
    }
  }

  public normalizeAddress(value: string): string {
    try {
      return new PublicKey(value).toBase58()
    } catch {
      throw new Error(`Invalid SVM address: ${value}`)
    }
  }

  public formatAddress(value: string): string {
    return this.normalizeAddress(value)
  }

  public async getBalance(address: string): Promise<bigint> {
    await this.assertGenesisHash()
    return BigInt(await this.connection.getBalance(new PublicKey(this.normalizeAddress(address)), this.commitment))
  }

  public async getAccount(address: string): Promise<SvmAccountResult | null> {
    await this.assertGenesisHash()
    const normalized = this.normalizeAddress(address)
    const account = await this.connection.getAccountInfo(new PublicKey(normalized), this.commitment)
    if (!account) return null
    return {
      address: normalized,
      lamports: BigInt(account.lamports),
      owner: account.owner.toBase58(),
      executable: account.executable,
      rentEpoch: account.rentEpoch === undefined ? undefined : BigInt(account.rentEpoch),
      data: `base64:${Buffer.from(account.data).toString('base64')}`,
    }
  }

  public async programExists(address: string): Promise<boolean> {
    const account = await this.getAccount(address)
    return account?.executable === true
  }

  public deriveProgramAddress(programId: string, seeds: Uint8Array[]): { address: string; bump: number } {
    if (seeds.some(seed => seed.length > 32)) {
      throw new Error('SVM PDA seeds must not exceed 32 bytes each.')
    }
    const [address, bump] = PublicKey.findProgramAddressSync(
      seeds.map(seed => Buffer.from(seed)),
      new PublicKey(this.normalizeAddress(programId))
    )
    return { address: address.toBase58(), bump }
  }

  public deriveAssociatedTokenAddress(owner: string, mint: string, tokenProgramId?: string): string {
    const ownerKey = new PublicKey(this.normalizeAddress(owner))
    const mintKey = new PublicKey(this.normalizeAddress(mint))
    const tokenKey = tokenProgramId
      ? new PublicKey(this.normalizeAddress(tokenProgramId))
      : SVM_TOKEN_PROGRAM_ID
    const [address] = PublicKey.findProgramAddressSync(
      [ownerKey.toBuffer(), tokenKey.toBuffer(), mintKey.toBuffer()],
      SVM_ASSOCIATED_TOKEN_PROGRAM_ID
    )
    return address.toBase58()
  }

  public async transfer(to: string, lamports: bigint, options: SvmTransactionOptions = {}): Promise<SvmTransactionResult> {
    if (lamports <= 0n || lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`SVM transfer lamports must be between 1 and ${Number.MAX_SAFE_INTEGER}.`)
    }
    const payer = await this.getSigner()
    const instruction = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: new PublicKey(this.normalizeAddress(to)),
      lamports: Number(lamports),
    })
    return this.sendWeb3Instructions([instruction], [], options)
  }

  public async sendInstructions(
    instructions: SvmInstructionRequest[],
    options: SvmTransactionOptions = {}
  ): Promise<SvmTransactionResult> {
    if (instructions.length === 0) {
      throw new Error('svm-send-instructions requires at least one instruction.')
    }
    const signers = await Promise.all((options.signerKeypairPaths || []).map(file => this.readKeypair(file)))
    const web3Instructions = instructions.map(instruction => new TransactionInstruction({
      programId: new PublicKey(this.normalizeAddress(instruction.programId)),
      keys: (instruction.accounts || []).map(account => ({
        pubkey: new PublicKey(this.normalizeAddress(account.address)),
        isSigner: account.isSigner === true,
        isWritable: account.isWritable === true,
      })),
      data: this.decodeInstructionData(instruction.data),
    }))
    return this.sendWeb3Instructions(web3Instructions, signers, options)
  }

  public async deployProgram(request: SvmProgramDeploymentRequest): Promise<SvmProgramDeploymentResult> {
    this.validateProgramBytes(request.programBytes)
    await this.assertGenesisHash()
    const transactionOptions: SvmTransactionOptions = { ...request, simulate: false }
    const payer = await this.getSigner()
    const program = await this.readKeypair(request.programKeypairPath)
    const existing = await this.connection.getAccountInfo(program.publicKey, this.commitment)
    if (existing) {
      throw new Error(`SVM program account ${program.publicKey.toBase58()} already exists; use svm-upgrade-program.`)
    }

    const uploaded = await this.createAndWriteBuffer(request.programBytes, transactionOptions)
    const [programDataAddress] = PublicKey.findProgramAddressSync(
      [program.publicKey.toBuffer()],
      SVM_UPGRADEABLE_LOADER_ID
    )
    const maxDataLength = request.maxDataLength ?? request.programBytes.length
    if (!Number.isSafeInteger(maxDataLength) || maxDataLength < request.programBytes.length) {
      throw new Error('SVM maxDataLength must be a safe integer at least as large as the program binary.')
    }

    const programLamports = await this.connection.getMinimumBalanceForRentExemption(PROGRAM_ACCOUNT_SIZE)
    const deployInstruction = new TransactionInstruction({
      programId: SVM_UPGRADEABLE_LOADER_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: programDataAddress, isSigner: false, isWritable: true },
        { pubkey: program.publicKey, isSigner: false, isWritable: true },
        { pubkey: uploaded.buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: this.encodeDeployWithMaxDataLength(maxDataLength),
    })
    const createProgram = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: program.publicKey,
      lamports: programLamports,
      space: PROGRAM_ACCOUNT_SIZE,
      programId: SVM_UPGRADEABLE_LOADER_ID,
    })
    const deployed = await this.sendWeb3Instructions([createProgram, deployInstruction], [program], transactionOptions) as SendResult

    return {
      programId: program.publicKey.toBase58(),
      programDataAddress: programDataAddress.toBase58(),
      bufferAddress: uploaded.buffer.publicKey.toBase58(),
      signatures: [...uploaded.signatures, deployed.signature],
      slot: deployed.slot,
    }
  }

  public async upgradeProgram(request: SvmProgramUpgradeRequest): Promise<SvmProgramDeploymentResult> {
    this.validateProgramBytes(request.programBytes)
    await this.assertGenesisHash()
    const transactionOptions: SvmTransactionOptions = { ...request, simulate: false }
    const payer = await this.getSigner()
    const program = new PublicKey(this.normalizeAddress(request.programId))
    const programInfo = await this.connection.getAccountInfo(program, this.commitment)
    if (!programInfo?.executable || !programInfo.owner.equals(SVM_UPGRADEABLE_LOADER_ID)) {
      throw new Error(`SVM program ${program.toBase58()} is not an upgradeable-loader program.`)
    }

    const [programDataAddress] = PublicKey.findProgramAddressSync([program.toBuffer()], SVM_UPGRADEABLE_LOADER_ID)
    const programDataInfo = await this.connection.getAccountInfo(programDataAddress, this.commitment)
    if (!programDataInfo) {
      throw new Error(`ProgramData account ${programDataAddress.toBase58()} was not found.`)
    }

    const signatures: string[] = []
    const currentCapacity = Math.max(0, programDataInfo.data.length - PROGRAM_DATA_METADATA_SIZE)
    if (request.programBytes.length > currentCapacity) {
      const additionalBytes = request.programBytes.length - currentCapacity
      const extended = await this.sendWeb3Instructions([
        new TransactionInstruction({
          programId: SVM_UPGRADEABLE_LOADER_ID,
          keys: [
            { pubkey: programDataAddress, isSigner: false, isWritable: true },
            { pubkey: program, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          ],
          data: this.encodeU32Pair(6, additionalBytes),
        })
      ], [], transactionOptions) as SendResult
      signatures.push(extended.signature)
    }

    const uploaded = await this.createAndWriteBuffer(request.programBytes, transactionOptions)
    signatures.push(...uploaded.signatures)
    const upgraded = await this.sendWeb3Instructions([
      new TransactionInstruction({
        programId: SVM_UPGRADEABLE_LOADER_ID,
        keys: [
          { pubkey: programDataAddress, isSigner: false, isWritable: true },
          { pubkey: program, isSigner: false, isWritable: true },
          { pubkey: uploaded.buffer.publicKey, isSigner: false, isWritable: true },
          { pubkey: payer.publicKey, isSigner: false, isWritable: true },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
          { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        ],
        data: this.encodeU32(3),
      })
    ], [], transactionOptions) as SendResult
    signatures.push(upgraded.signature)

    return {
      programId: program.toBase58(),
      programDataAddress: programDataAddress.toBase58(),
      bufferAddress: uploaded.buffer.publicKey.toBase58(),
      signatures,
      slot: upgraded.slot,
    }
  }

  public async dispose(): Promise<void> {
    // web3.js Connection uses HTTP/WebSocket resources managed by the runtime.
  }

  private async createAndWriteBuffer(
    programBytes: Uint8Array,
    options: SvmTransactionOptions
  ): Promise<{ buffer: Keypair; signatures: string[] }> {
    const payer = await this.getSigner()
    const buffer = Keypair.generate()
    const size = BUFFER_METADATA_SIZE + programBytes.length
    const lamports = await this.connection.getMinimumBalanceForRentExemption(size)
    const initialize = new TransactionInstruction({
      programId: SVM_UPGRADEABLE_LOADER_ID,
      keys: [
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: false, isWritable: false },
      ],
      data: this.encodeU32(0),
    })
    const created = await this.sendWeb3Instructions([
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: buffer.publicKey,
        lamports,
        space: size,
        programId: SVM_UPGRADEABLE_LOADER_ID,
      }),
      initialize,
    ], [buffer], options) as SendResult
    const signatures = [created.signature]

    for (let offset = 0; offset < programBytes.length; offset += this.programChunkSize) {
      const bytes = programBytes.slice(offset, offset + this.programChunkSize)
      const written = await this.sendWeb3Instructions([
        new TransactionInstruction({
          programId: SVM_UPGRADEABLE_LOADER_ID,
          keys: [
            { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },
          ],
          data: this.encodeWrite(offset, bytes),
        })
      ], [], options) as SendResult
      signatures.push(written.signature)
    }

    return { buffer, signatures }
  }

  private async sendWeb3Instructions(
    instructions: TransactionInstruction[],
    additionalSigners: Signer[],
    options: SvmTransactionOptions
  ): Promise<SvmTransactionResult> {
    await this.assertGenesisHash()
    const payer = await this.getSigner()
    const budget: TransactionInstruction[] = []
    if (options.computeUnitLimit !== undefined) {
      if (!Number.isSafeInteger(options.computeUnitLimit) || options.computeUnitLimit <= 0) {
        throw new Error('SVM computeUnitLimit must be a positive safe integer.')
      }
      budget.push(ComputeBudgetProgram.setComputeUnitLimit({ units: options.computeUnitLimit }))
    }
    if (options.computeUnitPriceMicroLamports !== undefined) {
      if (options.computeUnitPriceMicroLamports < 0n) {
        throw new Error('SVM computeUnitPriceMicroLamports cannot be negative.')
      }
      budget.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: options.computeUnitPriceMicroLamports }))
    }

    const latest = await this.connection.getLatestBlockhash(this.commitment)
    const transaction = new Transaction({
      feePayer: payer.publicKey,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }).add(...budget, ...instructions)
    const signers = this.uniqueSigners([payer, ...additionalSigners])
    transaction.sign(...signers)

    if (options.simulate === true) {
      const simulation = await this.connection.simulateTransaction(transaction)
      return {
        status: simulation.value.err ? 0 : 1,
        slot: simulation.context.slot,
        simulated: true,
        logs: simulation.value.logs,
        unitsConsumed: simulation.value.unitsConsumed,
        raw: simulation,
      }
    }

    const signature = await this.connection.sendRawTransaction(transaction.serialize(), this.sendOptions)
    const confirmation = await this.connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }, this.commitment)
    if (confirmation.value.err) {
      throw new Error(`SVM transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`)
    }
    return {
      signature,
      status: 1,
      slot: confirmation.context.slot,
      simulated: false,
      raw: confirmation,
    }
  }

  private async getSigner(): Promise<Keypair> {
    if (this.signer) return this.signer
    if (!this.keypairPath) {
      throw new Error('SVM actions require a Solana keypair via --keypair or SOLANA_KEYPAIR.')
    }
    this.signer = await this.readKeypair(this.keypairPath)
    return this.signer
  }

  private async readKeypair(filePath: string): Promise<Keypair> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
    } catch (error) {
      throw new Error(`Unable to read SVM keypair ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
    const secret = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).secretKey : undefined)
    if (!Array.isArray(secret) || secret.length !== 64 || !secret.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw new Error(`SVM keypair ${filePath} must contain a 64-byte JSON secret-key array.`)
    }
    return Keypair.fromSecretKey(Uint8Array.from(secret as number[]))
  }

  private async assertGenesisHash(): Promise<void> {
    if (this.genesisHashChecked || !this.network.genesisHash) return
    const actual = await this.connection.getGenesisHash()
    if (actual !== this.network.genesisHash) {
      throw new Error(`SVM RPC genesis hash mismatch for ${this.network.name}: expected ${this.network.genesisHash}, got ${actual}.`)
    }
    this.genesisHashChecked = true
  }

  private decodeInstructionData(value: SvmInstructionRequest['data']): Buffer {
    if (value === undefined) return Buffer.alloc(0)
    if (value instanceof Uint8Array || Array.isArray(value)) return Buffer.from(value)
    if (value.startsWith('base64:')) return Buffer.from(value.slice('base64:'.length), 'base64')
    if (/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) return Buffer.from(value.slice(2), 'hex')
    throw new Error('SVM instruction data must be 0x-prefixed hex, base64:<data>, or a byte array.')
  }

  private encodeU32(value: number): Buffer {
    const data = Buffer.alloc(4)
    data.writeUInt32LE(value, 0)
    return data
  }

  private encodeU32Pair(first: number, second: number): Buffer {
    const data = Buffer.alloc(8)
    data.writeUInt32LE(first, 0)
    data.writeUInt32LE(second, 4)
    return data
  }

  private encodeDeployWithMaxDataLength(maxDataLength: number): Buffer {
    const data = Buffer.alloc(12)
    data.writeUInt32LE(2, 0)
    data.writeBigUInt64LE(BigInt(maxDataLength), 4)
    return data
  }

  private encodeWrite(offset: number, bytes: Uint8Array): Buffer {
    const data = Buffer.alloc(16 + bytes.length)
    data.writeUInt32LE(1, 0)
    data.writeUInt32LE(offset, 4)
    data.writeBigUInt64LE(BigInt(bytes.length), 8)
    Buffer.from(bytes).copy(data, 16)
    return data
  }

  private uniqueSigners(signers: Signer[]): Signer[] {
    const result = new Map<string, Signer>()
    for (const signer of signers) result.set(signer.publicKey.toBase58(), signer)
    return Array.from(result.values())
  }

  private validateProgramBytes(bytes: Uint8Array): void {
    if (bytes.length < 4 || bytes[0] !== 0x7f || bytes[1] !== 0x45 || bytes[2] !== 0x4c || bytes[3] !== 0x46) {
      throw new Error('SVM program artifact must be an ELF binary.')
    }
  }

  private getCommitmentParam(value: unknown): Commitment {
    const commitment = value === undefined ? 'confirmed' : value
    if (commitment !== 'processed' && commitment !== 'confirmed' && commitment !== 'finalized') {
      throw new Error('Network params.commitment must be processed, confirmed, or finalized.')
    }
    return commitment
  }

  private getOptionalPositiveInteger(value: unknown, name: string): number | undefined {
    if (value === undefined) return undefined
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Network params.${name} must be a positive safe integer.`)
    }
    return value
  }
}
