import * as fs from 'fs/promises'
import { createHash } from 'crypto'
import * as multisig from '@sqds/multisig'
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
  TransactionMessage,
} from '@solana/web3.js'
import { Network } from '../types/network'
import {
  SvmAccountResult,
  SvmChainAdapter,
  SvmInstructionRequest,
  SvmProgramDeploymentRequest,
  SvmProgramDeploymentResult,
  SvmProgramBufferRequest,
  SvmProgramBufferResult,
  SvmProgramReservationRequest,
  SvmProgramVerificationRequest,
  SvmProgramVerificationResult,
  SvmPreparedUpgradeResult,
  SvmSquadsExecutionRequest,
  SvmSquadsProposalRequest,
  SvmSquadsProposalResult,
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
const PROGRAM_STATE_TAG = 2
const PROGRAM_DATA_STATE_TAG = 3
const BUFFER_STATE_TAG = 1

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
    const web3Instructions = instructions.map(instruction => this.toWeb3Instruction(instruction))
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

  public async reserveProgram(request: SvmProgramReservationRequest): Promise<SvmProgramDeploymentResult> {
    this.validateProgramBytes(request.stubBytes)
    await this.assertGenesisHash()
    const transactionOptions: SvmTransactionOptions = { ...request, simulate: false }
    const payer = await this.getSigner()
    const finalAuthority = new PublicKey(this.normalizeAddress(request.finalAuthority))
    if (!Number.isSafeInteger(request.maxDataLength) || request.maxDataLength < request.stubBytes.length) {
      throw new Error('SVM reservation maxDataLength must be a safe integer at least as large as the stub binary.')
    }
    const maxAttempts = request.programKeypairPath ? 1 : (request.maxAttempts ?? 3)
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new Error('SVM reservation maxAttempts must be an integer between 1 and 20.')
    }

    // The temporary authority is never persisted. It can upload and deploy the
    // inert stub, but the successful transaction immediately hands authority to
    // governance before any committed state is observable.
    const bootstrapAuthority = Keypair.generate()
    const uploaded = await this.createAndWriteBuffer(request.stubBytes, transactionOptions, bootstrapAuthority)

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Generate the target only after the generic stub buffer has been uploaded,
      // so the counterfactual ProgramData address is not disclosed by buffer data.
      const program = request.programKeypairPath
        ? await this.readKeypair(request.programKeypairPath)
        : Keypair.generate()
      const [programDataAddress] = PublicKey.findProgramAddressSync(
        [program.publicKey.toBuffer()],
        SVM_UPGRADEABLE_LOADER_ID
      )
      if (await this.freshProgramAddressOccupied(program.publicKey, programDataAddress)) {
        if (request.programKeypairPath) {
          throw new Error(`SVM reservation address ${program.publicKey.toBase58()} or its ProgramData PDA is already occupied.`)
        }
        continue
      }

      const programLamports = await this.connection.getMinimumBalanceForRentExemption(PROGRAM_ACCOUNT_SIZE)
      const createProgram = SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: program.publicKey,
        lamports: programLamports,
        space: PROGRAM_ACCOUNT_SIZE,
        programId: SVM_UPGRADEABLE_LOADER_ID,
      })
      const deployInstruction = this.createDeployInstruction({
        payer: payer.publicKey,
        program: program.publicKey,
        programData: programDataAddress,
        buffer: uploaded.buffer.publicKey,
        authority: bootstrapAuthority.publicKey,
        maxDataLength: request.maxDataLength,
      })
      const transferAuthority = this.createSetAuthorityInstruction(
        programDataAddress,
        bootstrapAuthority.publicKey,
        finalAuthority
      )

      try {
        const deployed = await this.sendWeb3Instructions(
          [createProgram, deployInstruction, transferAuthority],
          [program, bootstrapAuthority],
          transactionOptions
        ) as SendResult
        return {
          programId: program.publicKey.toBase58(),
          programDataAddress: programDataAddress.toBase58(),
          bufferAddress: uploaded.buffer.publicKey.toBase58(),
          signatures: [...uploaded.signatures, deployed.signature],
          slot: deployed.slot,
          authority: finalAuthority.toBase58(),
          artifactHash: this.sha256(request.stubBytes),
          attempts: attempt,
        }
      } catch (error) {
        const occupied = await this.freshProgramAddressOccupied(program.publicKey, programDataAddress)
        if (!request.programKeypairPath && occupied && attempt < maxAttempts) continue
        throw error
      }
    }

    throw new Error(`Unable to reserve an undusted SVM program address after ${maxAttempts} attempts.`)
  }

  public async writeProgramBuffer(request: SvmProgramBufferRequest): Promise<SvmProgramBufferResult> {
    this.validateProgramBytes(request.programBytes)
    await this.assertGenesisHash()
    const transactionOptions: SvmTransactionOptions = { ...request, simulate: false }
    const finalAuthority = new PublicKey(this.normalizeAddress(request.finalAuthority))
    const uploadAuthority = Keypair.generate()
    const uploaded = await this.createAndWriteBuffer(request.programBytes, transactionOptions, uploadAuthority)
    const transferred = await this.sendWeb3Instructions([
      this.createSetAuthorityInstruction(uploaded.buffer.publicKey, uploadAuthority.publicKey, finalAuthority)
    ], [uploadAuthority], transactionOptions) as SendResult
    const buffer = await this.loadBufferState(uploaded.buffer.publicKey)
    if (!buffer.authority?.equals(finalAuthority) || !buffer.payload.equals(Buffer.from(request.programBytes))) {
      throw new Error('SVM buffer verification failed after transferring authority.')
    }
    return {
      bufferAddress: uploaded.buffer.publicKey.toBase58(),
      authority: finalAuthority.toBase58(),
      artifactHash: this.sha256(request.programBytes),
      byteLength: request.programBytes.length,
      signatures: [...uploaded.signatures, transferred.signature],
      slot: transferred.slot,
    }
  }

  public async prepareUpgrade(
    programBytes: Uint8Array,
    programId: string,
    bufferAddress: string
  ): Promise<SvmPreparedUpgradeResult> {
    this.validateProgramBytes(programBytes)
    await this.assertGenesisHash()
    const program = new PublicKey(this.normalizeAddress(programId))
    const bufferKey = new PublicKey(this.normalizeAddress(bufferAddress))
    const state = await this.loadProgramState(program)
    const buffer = await this.loadBufferState(bufferKey)
    if (!state.authority) throw new Error(`SVM program ${program.toBase58()} is immutable.`)
    if (!buffer.authority?.equals(state.authority)) {
      throw new Error('SVM buffer authority does not match the program upgrade authority.')
    }
    if (!buffer.payload.equals(Buffer.from(programBytes))) {
      throw new Error('SVM buffer bytes do not exactly match the requested program artifact.')
    }
    if (programBytes.length > state.capacity) {
      throw new Error(`SVM program requires ${programBytes.length} bytes but ProgramData capacity is ${state.capacity}; reserve more capacity or approve an extension first.`)
    }
    const instruction: SvmInstructionRequest = {
      programId: SVM_UPGRADEABLE_LOADER_ID.toBase58(),
      accounts: [
        { address: state.programDataAddress.toBase58(), isWritable: true },
        { address: program.toBase58(), isWritable: true },
        { address: bufferKey.toBase58(), isWritable: true },
        { address: state.authority.toBase58(), isWritable: true },
        { address: SYSVAR_RENT_PUBKEY.toBase58() },
        { address: SYSVAR_CLOCK_PUBKEY.toBase58() },
        { address: state.authority.toBase58(), isSigner: true },
      ],
      data: this.encodeU32(3),
    }
    return {
      programId: program.toBase58(),
      programDataAddress: state.programDataAddress.toBase58(),
      bufferAddress: bufferKey.toBase58(),
      authority: state.authority.toBase58(),
      artifactHash: this.sha256(programBytes),
      byteLength: programBytes.length,
      instructions: [instruction],
    }
  }

  public async createSquadsProposal(request: SvmSquadsProposalRequest): Promise<SvmSquadsProposalResult> {
    await this.assertGenesisHash()
    const payer = await this.getSigner()
    const multisigAddress = new PublicKey(this.normalizeAddress(request.multisigAddress))
    if (!Number.isSafeInteger(request.vaultIndex) || request.vaultIndex < 0 || request.vaultIndex > 255) {
      throw new Error('Squads vaultIndex must be an integer between 0 and 255.')
    }
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
      this.connection,
      multisigAddress,
      this.commitment
    )
    const transactionIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n
    const [vaultAddress] = multisig.getVaultPda({ multisigPda: multisigAddress, index: request.vaultIndex })
    const [transactionAddress] = multisig.getTransactionPda({ multisigPda: multisigAddress, index: transactionIndex })
    const [proposalAddress] = multisig.getProposalPda({ multisigPda: multisigAddress, transactionIndex })
    const requiredSigners = request.instructions.flatMap(instruction =>
      (instruction.accounts || [])
        .filter(account => account.isSigner)
        .map(account => new PublicKey(this.normalizeAddress(account.address)))
    )
    if (requiredSigners.length === 0 || requiredSigners.some(address => !address.equals(vaultAddress))) {
      throw new Error(
        `Every signer required by a Squads vault transaction must be the derived vault ${vaultAddress.toBase58()}.`
      )
    }
    const latest = await this.connection.getLatestBlockhash(this.commitment)
    const transactionMessage = new TransactionMessage({
      payerKey: vaultAddress,
      recentBlockhash: latest.blockhash,
      instructions: request.instructions.map(instruction => this.toWeb3Instruction(instruction)),
    })
    const createTransaction = multisig.instructions.vaultTransactionCreate({
      multisigPda: multisigAddress,
      transactionIndex,
      creator: payer.publicKey,
      rentPayer: payer.publicKey,
      vaultIndex: request.vaultIndex,
      ephemeralSigners: 0,
      transactionMessage,
      memo: request.memo,
    })
    const createProposal = multisig.instructions.proposalCreate({
      multisigPda: multisigAddress,
      transactionIndex,
      creator: payer.publicKey,
      rentPayer: payer.publicKey,
    })
    const result = await this.sendWeb3Instructions(
      [createTransaction, createProposal],
      [],
      { ...request, simulate: false }
    ) as SendResult
    return {
      ...result,
      multisigAddress: multisigAddress.toBase58(),
      vaultAddress: vaultAddress.toBase58(),
      transactionAddress: transactionAddress.toBase58(),
      proposalAddress: proposalAddress.toBase58(),
      transactionIndex: transactionIndex.toString(),
    }
  }

  public async executeSquadsTransaction(request: SvmSquadsExecutionRequest): Promise<SvmTransactionResult> {
    await this.assertGenesisHash()
    const payer = await this.getSigner()
    const multisigAddress = new PublicKey(this.normalizeAddress(request.multisigAddress))
    const executable = await multisig.instructions.vaultTransactionExecute({
      connection: this.connection,
      multisigPda: multisigAddress,
      transactionIndex: request.transactionIndex,
      member: payer.publicKey,
    })
    if (executable.lookupTableAccounts.length > 0) {
      throw new Error('Squads transactions using address lookup tables are not supported by the current SVM adapter.')
    }
    return this.sendWeb3Instructions([executable.instruction], [], { ...request, simulate: false })
  }

  public async verifyProgram(request: SvmProgramVerificationRequest): Promise<SvmProgramVerificationResult> {
    this.validateProgramBytes(request.programBytes)
    await this.assertGenesisHash()
    const program = new PublicKey(this.normalizeAddress(request.programId))
    const state = await this.loadProgramState(program)
    const expected = Buffer.from(request.programBytes)
    if (!state.payload.subarray(0, expected.length).equals(expected)) {
      throw new Error(`SVM ProgramData bytes do not match artifact ${this.sha256(request.programBytes)}.`)
    }
    if (state.payload.subarray(expected.length).some(byte => byte !== 0)) {
      throw new Error('SVM ProgramData contains unexpected non-zero bytes after the artifact.')
    }
    if (request.expectedAuthority !== undefined) {
      const expectedAuthority = request.expectedAuthority === null
        ? null
        : new PublicKey(this.normalizeAddress(request.expectedAuthority))
      if ((expectedAuthority === null) !== (state.authority === null)
        || (expectedAuthority && state.authority && !expectedAuthority.equals(state.authority))) {
        throw new Error(`SVM upgrade authority mismatch: expected ${expectedAuthority?.toBase58() ?? 'None'}, got ${state.authority?.toBase58() ?? 'None'}.`)
      }
    }
    const currentSlot = await this.connection.getSlot(this.commitment)
    const visible = currentSlot > state.deploymentSlot
    if (request.requireVisible !== false && !visible) {
      throw new Error(`SVM program deployed at slot ${state.deploymentSlot} is not visible until a later slot (current ${currentSlot}).`)
    }
    return {
      programId: program.toBase58(),
      programDataAddress: state.programDataAddress.toBase58(),
      authority: state.authority?.toBase58() ?? null,
      artifactHash: this.sha256(request.programBytes),
      byteLength: request.programBytes.length,
      deploymentSlot: state.deploymentSlot,
      currentSlot,
      visible,
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
    options: SvmTransactionOptions,
    authority?: Signer
  ): Promise<{ buffer: Keypair; signatures: string[]; slot?: number }> {
    const payer = await this.getSigner()
    const bufferAuthority = authority || payer
    const buffer = Keypair.generate()
    const size = BUFFER_METADATA_SIZE + programBytes.length
    const lamports = await this.connection.getMinimumBalanceForRentExemption(size)
    const initialize = new TransactionInstruction({
      programId: SVM_UPGRADEABLE_LOADER_ID,
      keys: [
        { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
        { pubkey: bufferAuthority.publicKey, isSigner: false, isWritable: false },
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
    let slot = created.slot

    for (let offset = 0; offset < programBytes.length; offset += this.programChunkSize) {
      const bytes = programBytes.slice(offset, offset + this.programChunkSize)
      const written = await this.sendWeb3Instructions([
        new TransactionInstruction({
          programId: SVM_UPGRADEABLE_LOADER_ID,
            keys: [
              { pubkey: buffer.publicKey, isSigner: false, isWritable: true },
              { pubkey: bufferAuthority.publicKey, isSigner: true, isWritable: false },
            ],
            data: this.encodeWrite(offset, bytes),
          })
      ], [bufferAuthority], options) as SendResult
      signatures.push(written.signature)
      slot = written.slot
    }

    return { buffer, signatures, slot }
  }

  private createDeployInstruction(input: {
    payer: PublicKey
    program: PublicKey
    programData: PublicKey
    buffer: PublicKey
    authority: PublicKey
    maxDataLength: number
  }): TransactionInstruction {
    return new TransactionInstruction({
      programId: SVM_UPGRADEABLE_LOADER_ID,
      keys: [
        { pubkey: input.payer, isSigner: true, isWritable: true },
        { pubkey: input.programData, isSigner: false, isWritable: true },
        { pubkey: input.program, isSigner: false, isWritable: true },
        { pubkey: input.buffer, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: input.authority, isSigner: true, isWritable: false },
      ],
      data: this.encodeDeployWithMaxDataLength(input.maxDataLength),
    })
  }

  private createSetAuthorityInstruction(
    account: PublicKey,
    currentAuthority: PublicKey,
    newAuthority: PublicKey | null
  ): TransactionInstruction {
    return new TransactionInstruction({
      programId: SVM_UPGRADEABLE_LOADER_ID,
      keys: [
        { pubkey: account, isSigner: false, isWritable: true },
        { pubkey: currentAuthority, isSigner: true, isWritable: false },
        ...(newAuthority ? [{ pubkey: newAuthority, isSigner: false, isWritable: false }] : []),
      ],
      data: this.encodeU32(4),
    })
  }

  private toWeb3Instruction(instruction: SvmInstructionRequest): TransactionInstruction {
    return new TransactionInstruction({
      programId: new PublicKey(this.normalizeAddress(instruction.programId)),
      keys: (instruction.accounts || []).map(account => ({
        pubkey: new PublicKey(this.normalizeAddress(account.address)),
        isSigner: account.isSigner === true,
        isWritable: account.isWritable === true,
      })),
      data: this.decodeInstructionData(instruction.data),
    })
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

  private async freshProgramAddressOccupied(program: PublicKey, programData: PublicKey): Promise<boolean> {
    const [programInfo, programDataInfo] = await Promise.all([
      this.connection.getAccountInfo(program, this.commitment),
      this.connection.getAccountInfo(programData, this.commitment),
    ])
    return programInfo !== null || programDataInfo !== null
  }

  private async loadBufferState(buffer: PublicKey): Promise<{ authority: PublicKey | null; payload: Buffer }> {
    const account = await this.connection.getAccountInfo(buffer, this.commitment)
    if (!account || !account.owner.equals(SVM_UPGRADEABLE_LOADER_ID)) {
      throw new Error(`SVM buffer ${buffer.toBase58()} is missing or not owned by Loader-v3.`)
    }
    const data = Buffer.from(account.data)
    if (data.length < BUFFER_METADATA_SIZE || data.readUInt32LE(0) !== BUFFER_STATE_TAG) {
      throw new Error(`SVM account ${buffer.toBase58()} is not an initialized Loader-v3 buffer.`)
    }
    const option = data[4]
    if (option !== 0 && option !== 1) throw new Error('SVM buffer has an invalid authority encoding.')
    const authority = option === 1 ? new PublicKey(data.subarray(5, 37)) : null
    return { authority, payload: data.subarray(BUFFER_METADATA_SIZE) }
  }

  private async loadProgramState(program: PublicKey): Promise<{
    programDataAddress: PublicKey
    authority: PublicKey | null
    payload: Buffer
    capacity: number
    deploymentSlot: number
  }> {
    const programAccount = await this.connection.getAccountInfo(program, this.commitment)
    if (!programAccount?.executable || !programAccount.owner.equals(SVM_UPGRADEABLE_LOADER_ID)) {
      throw new Error(`SVM program ${program.toBase58()} is missing or not executable under Loader-v3.`)
    }
    const programData = Buffer.from(programAccount.data)
    if (programData.length < PROGRAM_ACCOUNT_SIZE || programData.readUInt32LE(0) !== PROGRAM_STATE_TAG) {
      throw new Error(`SVM program ${program.toBase58()} has invalid Loader-v3 state.`)
    }
    const linkedProgramData = new PublicKey(programData.subarray(4, 36))
    const [derivedProgramData] = PublicKey.findProgramAddressSync([program.toBuffer()], SVM_UPGRADEABLE_LOADER_ID)
    if (!linkedProgramData.equals(derivedProgramData)) {
      throw new Error(`SVM program ${program.toBase58()} points to a non-canonical ProgramData account.`)
    }
    const programDataAccount = await this.connection.getAccountInfo(derivedProgramData, this.commitment)
    if (!programDataAccount || !programDataAccount.owner.equals(SVM_UPGRADEABLE_LOADER_ID)) {
      throw new Error(`ProgramData account ${derivedProgramData.toBase58()} is missing or has the wrong owner.`)
    }
    const data = Buffer.from(programDataAccount.data)
    if (data.length < PROGRAM_DATA_METADATA_SIZE || data.readUInt32LE(0) !== PROGRAM_DATA_STATE_TAG) {
      throw new Error(`ProgramData account ${derivedProgramData.toBase58()} has invalid Loader-v3 state.`)
    }
    const rawSlot = data.readBigUInt64LE(4)
    if (rawSlot > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('SVM deployment slot exceeds the safe integer range.')
    const option = data[12]
    if (option !== 0 && option !== 1) throw new Error('SVM ProgramData has an invalid authority encoding.')
    const authority = option === 1 ? new PublicKey(data.subarray(13, 45)) : null
    const payload = data.subarray(PROGRAM_DATA_METADATA_SIZE)
    return {
      programDataAddress: derivedProgramData,
      authority,
      payload,
      capacity: payload.length,
      deploymentSlot: Number(rawSlot),
    }
  }

  private sha256(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex')
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
