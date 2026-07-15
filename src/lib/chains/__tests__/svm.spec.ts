import * as multisig from '@sqds/multisig'
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { Network } from '../../types'
import { SVM_UPGRADEABLE_LOADER_ID, SvmAdapter } from '../svm'

const ELF = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46])

function makeNetwork(overrides: Partial<Network> = {}): Network {
  return {
    name: 'Solana Localnet',
    chainId: 900_000,
    networkId: 'solana-localnet',
    rpcUrl: 'http://127.0.0.1:8899',
    platform: 'svm',
    ...overrides,
  }
}

function makeAdapter(network: Network = makeNetwork()) {
  const signer = Keypair.generate()
  const owner = Keypair.generate().publicKey
  const blockhash = Keypair.generate().publicKey.toBase58()
  const rpc = {
    getBalance: jest.fn().mockResolvedValue(1_500_000_000),
    getAccountInfo: jest.fn().mockResolvedValue({
      data: Buffer.from([1, 2, 3]),
      executable: true,
      lamports: 42,
      owner,
      rentEpoch: 7,
    }),
    getGenesisHash: jest.fn().mockResolvedValue('test-genesis'),
    getLatestBlockhash: jest.fn().mockResolvedValue({ blockhash, lastValidBlockHeight: 123 }),
    getMinimumBalanceForRentExemption: jest.fn().mockResolvedValue(1_000_000),
    getSlot: jest.fn().mockResolvedValue(43),
    simulateTransaction: jest.fn().mockResolvedValue({
      context: { slot: 41 },
      value: { err: null, logs: ['Program log: ok'], unitsConsumed: 321 },
    }),
    sendRawTransaction: jest.fn().mockResolvedValue('test-signature'),
    confirmTransaction: jest.fn().mockResolvedValue({
      context: { slot: 42 },
      value: { err: null },
    }),
  }
  const adapter = new SvmAdapter(network, undefined, {
    connection: rpc as unknown as Connection,
    signer,
  })
  return { adapter, owner, rpc, signer }
}

function loaderAccount(data: Buffer, executable = false) {
  return {
    data,
    executable,
    lamports: 1_000_000,
    owner: SVM_UPGRADEABLE_LOADER_ID,
    rentEpoch: 0,
  }
}

function bufferData(authority: PublicKey, bytes: Uint8Array): Buffer {
  const data = Buffer.alloc(37 + bytes.length)
  data.writeUInt32LE(1, 0)
  data[4] = 1
  authority.toBuffer().copy(data, 5)
  Buffer.from(bytes).copy(data, 37)
  return data
}

function programState(
  program: PublicKey,
  authority: PublicKey | null,
  bytes: Uint8Array,
  capacity = bytes.length,
  deploymentSlot = 40
) {
  const [programDataAddress] = PublicKey.findProgramAddressSync(
    [program.toBuffer()],
    SVM_UPGRADEABLE_LOADER_ID
  )
  const programData = Buffer.alloc(36)
  programData.writeUInt32LE(2, 0)
  programDataAddress.toBuffer().copy(programData, 4)
  const deployed = Buffer.alloc(45 + capacity)
  deployed.writeUInt32LE(3, 0)
  deployed.writeBigUInt64LE(BigInt(deploymentSlot), 4)
  deployed[12] = authority ? 1 : 0
  if (authority) authority.toBuffer().copy(deployed, 13)
  Buffer.from(bytes).copy(deployed, 45)
  return {
    programDataAddress,
    programAccount: loaderAccount(programData, true),
    programDataAccount: loaderAccount(deployed),
  }
}

describe('SvmAdapter', () => {
  it('uses canonical base58 addresses and formats lamports without losing precision', () => {
    const { adapter, signer } = makeAdapter()
    const address = signer.publicKey.toBase58()

    expect(adapter.executionModel).toBe('svm')
    expect(adapter.nativeCurrencySymbol).toBe('SOL')
    expect(adapter.isAddress(address)).toBe(true)
    expect(adapter.isAddress('0x1234')).toBe(false)
    expect(adapter.normalizeAddress(address)).toBe(address)
    expect(adapter.formatNativeValue(1_500_000_001n)).toBe('1.500000001')
    expect(adapter.formatNativeValue(-1n)).toBe('-0.000000001')
  })

  it('reads SVM accounts and preserves account metadata', async () => {
    const { adapter, owner, rpc, signer } = makeAdapter()

    await expect(adapter.getBalance(signer.publicKey.toBase58())).resolves.toBe(1_500_000_000n)
    await expect(adapter.getAccount(signer.publicKey.toBase58())).resolves.toEqual({
      address: signer.publicKey.toBase58(),
      lamports: 42n,
      owner: owner.toBase58(),
      executable: true,
      rentEpoch: 7n,
      data: 'base64:AQID',
    })
    await expect(adapter.programExists(signer.publicKey.toBase58())).resolves.toBe(true)
    expect(rpc.getAccountInfo).toHaveBeenCalled()
  })

  it('derives PDAs and associated token accounts with native Solana rules', () => {
    const { adapter } = makeAdapter()
    const program = Keypair.generate().publicKey
    const owner = Keypair.generate().publicKey
    const mint = Keypair.generate().publicKey
    const seeds = [Buffer.from('catapult'), owner.toBuffer()]
    const [expectedPda, expectedBump] = PublicKey.findProgramAddressSync(seeds, program)

    expect(adapter.deriveProgramAddress(program.toBase58(), seeds)).toEqual({
      address: expectedPda.toBase58(),
      bump: expectedBump,
    })
    expect(adapter.deriveAssociatedTokenAddress(owner.toBase58(), mint.toBase58())).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
  })

  it('simulates arbitrary instructions without broadcasting', async () => {
    const { adapter, rpc } = makeAdapter()
    const result = await adapter.sendInstructions([{
      programId: SystemProgram.programId.toBase58(),
      data: '0x0102',
    }], {
      simulate: true,
      computeUnitLimit: 250_000,
      computeUnitPriceMicroLamports: 2n,
    })

    expect(result).toMatchObject({
      status: 1,
      slot: 41,
      simulated: true,
      logs: ['Program log: ok'],
      unitsConsumed: 321,
    })
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(1)
    expect(rpc.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('signs, broadcasts, and confirms native SOL transfers', async () => {
    const { adapter, rpc } = makeAdapter()
    const recipient = Keypair.generate().publicKey.toBase58()

    await expect(adapter.transfer(recipient, 123n)).resolves.toMatchObject({
      signature: 'test-signature',
      status: 1,
      slot: 42,
      simulated: false,
    })
    expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(1)
    expect(rpc.confirmTransaction).toHaveBeenCalledTimes(1)
  })

  it('validates a configured genesis hash before using an RPC', async () => {
    const { adapter, rpc, signer } = makeAdapter(makeNetwork({ genesisHash: 'expected-genesis' }))

    await expect(adapter.getBalance(signer.publicKey.toBase58())).rejects.toThrow('genesis hash mismatch')
    expect(rpc.getBalance).not.toHaveBeenCalled()
  })

  it('deploys ELF programs through the upgradeable loader without a CLI dependency', async () => {
    const { adapter, rpc } = makeAdapter()
    const program = Keypair.generate()
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'catapult-svm-keypair-'))
    const keypairPath = path.join(tempDir, 'program-keypair.json')
    await fs.writeFile(keypairPath, JSON.stringify(Array.from(program.secretKey)))
    rpc.getAccountInfo.mockResolvedValueOnce(null)

    try {
      const result = await adapter.deployProgram({
        programBytes: ELF,
        programKeypairPath: keypairPath,
        simulate: true,
      })

      expect(result.programId).toBe(program.publicKey.toBase58())
      expect(result.signatures).toHaveLength(3)
      expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(3)
      expect(rpc.simulateTransaction).not.toHaveBeenCalled()
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('reserves a fresh program and transfers authority atomically to governance', async () => {
    const { adapter, rpc, signer } = makeAdapter()
    const governance = Keypair.generate().publicKey
    rpc.getAccountInfo.mockReset().mockResolvedValue(null)

    const result = await adapter.reserveProgram({
      stubBytes: ELF,
      finalAuthority: governance.toBase58(),
      maxDataLength: 1_024,
    })

    expect(result.authority).toBe(governance.toBase58())
    expect(result.attempts).toBe(1)
    expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(3)
    const raw = rpc.sendRawTransaction.mock.calls[2][0] as unknown as Buffer
    const reservation = Transaction.from(Buffer.from(raw))
    expect(reservation.instructions).toHaveLength(3)
    expect(reservation.instructions[1].data.readUInt32LE(0)).toBe(2)
    expect(reservation.instructions[2].data.readUInt32LE(0)).toBe(4)
    expect(reservation.instructions[2].keys[2].pubkey.equals(governance)).toBe(true)
    expect(reservation.instructions[1].keys[7].pubkey.equals(reservation.instructions[2].keys[1].pubkey)).toBe(true)
    expect(reservation.instructions[2].keys[1].pubkey.equals(signer.publicKey)).toBe(false)
  })

  it('retries with a new undisclosed program address if the first address is dusted', async () => {
    const { adapter, rpc } = makeAdapter()
    const governance = Keypair.generate().publicKey
    let accountRead = 0
    rpc.getAccountInfo.mockReset().mockImplementation(async () => {
      accountRead += 1
      return accountRead === 3 ? loaderAccount(Buffer.alloc(0)) : null
    })
    rpc.sendRawTransaction
      .mockResolvedValueOnce('buffer-created')
      .mockResolvedValueOnce('buffer-written')
      .mockRejectedValueOnce(new Error('account already in use'))
      .mockResolvedValueOnce('reservation-succeeded')

    const result = await adapter.reserveProgram({
      stubBytes: ELF,
      finalAuthority: governance.toBase58(),
      maxDataLength: 1_024,
      maxAttempts: 2,
    })

    expect(result.attempts).toBe(2)
    expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(4)
  })

  it('writes exact artifact bytes and seals the buffer to governance', async () => {
    const { adapter, rpc } = makeAdapter()
    const governance = Keypair.generate().publicKey
    rpc.getAccountInfo.mockReset().mockResolvedValue(loaderAccount(bufferData(governance, ELF)))

    const result = await adapter.writeProgramBuffer({
      programBytes: ELF,
      finalAuthority: governance.toBase58(),
    })

    expect(result.authority).toBe(governance.toBase58())
    expect(result.byteLength).toBe(ELF.length)
    expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(3)
    const raw = rpc.sendRawTransaction.mock.calls[2][0] as unknown as Buffer
    const transfer = Transaction.from(Buffer.from(raw))
    expect(transfer.instructions).toHaveLength(1)
    expect(transfer.instructions[0].data.readUInt32LE(0)).toBe(4)
    expect(transfer.instructions[0].keys[2].pubkey.equals(governance)).toBe(true)
  })

  it('prepares an upgrade only when ProgramData and buffer share the governance authority', async () => {
    const { adapter, rpc } = makeAdapter()
    const program = Keypair.generate().publicKey
    const authority = Keypair.generate().publicKey
    const buffer = Keypair.generate().publicKey
    const state = programState(program, authority, ELF, 64)
    rpc.getAccountInfo.mockReset().mockImplementation(async (address: PublicKey) => {
      if (address.equals(program)) return state.programAccount
      if (address.equals(state.programDataAddress)) return state.programDataAccount
      if (address.equals(buffer)) return loaderAccount(bufferData(authority, ELF))
      return null
    })

    const result = await adapter.prepareUpgrade(ELF, program.toBase58(), buffer.toBase58())

    expect(result.authority).toBe(authority.toBase58())
    expect(result.instructions[0].data).toEqual(Buffer.from([3, 0, 0, 0]))
    expect(result.instructions[0].accounts?.filter(account => account.isSigner)).toEqual([
      { address: authority.toBase58(), isSigner: true },
    ])
  })

  it('rejects a Squads transaction whose required signer is not its derived vault', async () => {
    const { adapter } = makeAdapter()
    const multisigAddress = Keypair.generate().publicKey
    const wrongAuthority = Keypair.generate().publicKey
    const readMultisig = jest.spyOn(multisig.accounts.Multisig, 'fromAccountAddress')
      .mockResolvedValue({ transactionIndex: 0n } as any)

    try {
      await expect(adapter.createSquadsProposal({
        multisigAddress: multisigAddress.toBase58(),
        vaultIndex: 0,
        instructions: [{
          programId: SVM_UPGRADEABLE_LOADER_ID.toBase58(),
          accounts: [{ address: wrongAuthority.toBase58(), isSigner: true }],
          data: '0x03000000',
        }],
      })).rejects.toThrow('Every signer required by a Squads vault transaction must be the derived vault')
    } finally {
      readMultisig.mockRestore()
    }
  })

  it('creates a Squads vault transaction and proposal without casting a vote', async () => {
    const { adapter, rpc } = makeAdapter()
    const multisigAddress = Keypair.generate().publicKey
    const [vaultAddress] = multisig.getVaultPda({ multisigPda: multisigAddress, index: 0 })
    const readMultisig = jest.spyOn(multisig.accounts.Multisig, 'fromAccountAddress')
      .mockResolvedValue({ transactionIndex: 6n } as any)

    try {
      const result = await adapter.createSquadsProposal({
        multisigAddress: multisigAddress.toBase58(),
        vaultIndex: 0,
        instructions: [{
          programId: SVM_UPGRADEABLE_LOADER_ID.toBase58(),
          accounts: [{ address: vaultAddress.toBase58(), isSigner: true }],
          data: '0x03000000',
        }],
      })

      expect(result).toMatchObject({
        multisigAddress: multisigAddress.toBase58(),
        vaultAddress: vaultAddress.toBase58(),
        transactionIndex: '7',
        signature: 'test-signature',
      })
      expect(rpc.sendRawTransaction).toHaveBeenCalledTimes(1)
      const raw = rpc.sendRawTransaction.mock.calls[0][0] as unknown as Buffer
      const transaction = Transaction.from(Buffer.from(raw))
      expect(transaction.instructions).toHaveLength(2)
    } finally {
      readMultisig.mockRestore()
    }
  })

  it('verifies exact ProgramData bytes, governance authority, and later-slot visibility', async () => {
    const { adapter, rpc } = makeAdapter()
    const program = Keypair.generate().publicKey
    const authority = Keypair.generate().publicKey
    const state = programState(program, authority, ELF, 32, 40)
    rpc.getAccountInfo.mockReset().mockImplementation(async (address: PublicKey) => {
      if (address.equals(program)) return state.programAccount
      if (address.equals(state.programDataAddress)) return state.programDataAccount
      return null
    })

    await expect(adapter.verifyProgram({
      programBytes: ELF,
      programId: program.toBase58(),
      expectedAuthority: authority.toBase58(),
    })).resolves.toMatchObject({
      programId: program.toBase58(),
      authority: authority.toBase58(),
      deploymentSlot: 40,
      currentSlot: 43,
      visible: true,
    })

    state.programDataAccount.data[45] ^= 0xff
    await expect(adapter.verifyProgram({
      programBytes: ELF,
      programId: program.toBase58(),
      expectedAuthority: authority.toBase58(),
    })).rejects.toThrow('ProgramData bytes do not match artifact')
  })

  it('requires an explicit keypair only when a signing operation is requested', async () => {
    const adapter = new SvmAdapter(makeNetwork())

    expect(adapter.isAddress(SystemProgram.programId.toBase58())).toBe(true)
    await expect(adapter.getSignerAddress()).rejects.toThrow('--keypair or SOLANA_KEYPAIR')
  })
})
