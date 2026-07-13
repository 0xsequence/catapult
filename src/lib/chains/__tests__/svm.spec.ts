import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { Network } from '../../types'
import { SvmAdapter } from '../svm'

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
        programBytes: Uint8Array.from([0x7f, 0x45, 0x4c, 0x46]),
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

  it('requires an explicit keypair only when a signing operation is requested', async () => {
    const adapter = new SvmAdapter(makeNetwork())

    expect(adapter.isAddress(SystemProgram.programId.toBase58())).toBe(true)
    await expect(adapter.getSignerAddress()).rejects.toThrow('--keypair or SOLANA_KEYPAIR')
  })
})
