import { getVaultPda } from '@sqds/multisig'
import { Keypair, SystemProgram } from '@solana/web3.js'
import { SvmAdapter } from '../../chains'
import { ContractRepository } from '../../contracts/repository'
import { Network, Job } from '../../types'
import { ExecutionContext } from '../context'
import { ExecutionEngine } from '../engine'
import { ValueResolver } from '../resolver'

function makeContext(): ExecutionContext {
  const network: Network = {
    name: 'Solana Localnet',
    chainId: 900_000,
    rpcUrl: 'http://127.0.0.1:8899',
    platform: 'svm',
  }
  return new ExecutionContext(network, undefined, new ContractRepository())
}

describe('SVM execution model', () => {
  it('executes native transfer and instruction actions and stores SVM outputs', async () => {
    const context = makeContext()
    const adapter = context.adapter as SvmAdapter
    const recipient = Keypair.generate().publicKey.toBase58()
    const transfer = jest.spyOn(adapter, 'transfer').mockResolvedValue({
      signature: 'transfer-signature',
      status: 1,
      slot: 10,
      simulated: false,
    })
    const sendInstructions = jest.spyOn(adapter, 'sendInstructions').mockResolvedValue({
      status: 1,
      slot: 11,
      simulated: true,
      logs: ['Program log: ok'],
      unitsConsumed: 99,
    })
    const job: Job = {
      name: 'svm-actions',
      version: '1',
      actions: [
        {
          name: 'fund',
          type: 'svm-transfer',
          arguments: { to: recipient, lamports: '42' },
        },
        {
          name: 'invoke',
          type: 'svm-send-instructions',
          depends_on: ['fund'],
          arguments: {
            instructions: [{
              programId: SystemProgram.programId.toBase58(),
              accounts: [{ address: recipient, isWritable: true }],
              data: '0x0102',
            }],
            computeUnitLimit: 200_000,
            simulate: true,
          },
        },
      ],
    }

    await new ExecutionEngine(new Map()).executeJob(job, context)

    expect(transfer).toHaveBeenCalledWith(recipient, 42n, {})
    expect(sendInstructions).toHaveBeenCalledWith(expect.any(Array), {
      computeUnitLimit: 200_000,
      simulate: true,
    })
    expect(context.getOutput('fund.signature')).toBe('transfer-signature')
    expect(context.getOutput('invoke.simulated')).toBe(true)
    expect(context.getOutput('invoke.unitsConsumed')).toBe(99)
  })

  it('resolves PDAs and associated token addresses without EVM coercion', async () => {
    const context = makeContext()
    const resolver = new ValueResolver()
    const program = Keypair.generate().publicKey.toBase58()
    const owner = Keypair.generate().publicKey.toBase58()
    const mint = Keypair.generate().publicKey.toBase58()

    const pda = await resolver.resolve<{ address: string; bump: number }>({
      type: 'svm-pda',
      arguments: {
        programId: program,
        seeds: [
          { value: 'counter' },
          { value: owner, encoding: 'address' },
        ],
      },
    }, context, new Map())
    const ata = await resolver.resolve<string>({
      type: 'svm-ata',
      arguments: { owner, mint },
    }, context, new Map())
    const multisig = Keypair.generate().publicKey
    const vault = await resolver.resolve<string>({
      type: 'svm-squads-vault',
      arguments: { multisig: multisig.toBase58(), vaultIndex: 2 },
    }, context, new Map())

    expect(pda).toEqual({ address: expect.any(String), bump: expect.any(Number) })
    expect((context.adapter as SvmAdapter).isAddress(pda.address)).toBe(true)
    expect((context.adapter as SvmAdapter).isAddress(ata)).toBe(true)
    expect(vault).toBe(getVaultPda({ multisigPda: multisig, index: 2 })[0].toBase58())
  })

  it('runs the authority-free reservation, Squads proposal, and verification actions', async () => {
    const context = makeContext()
    const adapter = context.adapter as SvmAdapter
    const programId = Keypair.generate().publicKey.toBase58()
    const programDataAddress = Keypair.generate().publicKey.toBase58()
    const bufferAddress = Keypair.generate().publicKey.toBase58()
    const governance = Keypair.generate().publicKey.toBase58()
    const multisigAddress = Keypair.generate().publicKey.toBase58()
    const vaultAddress = Keypair.generate().publicKey.toBase58()
    const engine = new ExecutionEngine(new Map())
    jest.spyOn(engine as any, 'readSvmProgram').mockResolvedValue(Uint8Array.from([0x7f, 0x45, 0x4c, 0x46]))
    const reserve = jest.spyOn(adapter, 'reserveProgram').mockResolvedValue({
      programId,
      programDataAddress,
      bufferAddress: Keypair.generate().publicKey.toBase58(),
      signatures: ['reserve-signature'],
      slot: 10,
      authority: governance,
      artifactHash: 'stub-hash',
      attempts: 1,
    })
    const writeBuffer = jest.spyOn(adapter, 'writeProgramBuffer').mockResolvedValue({
      bufferAddress,
      authority: governance,
      artifactHash: 'artifact-hash',
      byteLength: 4,
      signatures: ['buffer-signature'],
      slot: 11,
    })
    const prepared = {
      programId,
      programDataAddress,
      bufferAddress,
      authority: governance,
      artifactHash: 'artifact-hash',
      byteLength: 4,
      instructions: [{
        programId: SystemProgram.programId.toBase58(),
        accounts: [{ address: governance, isSigner: true }],
        data: '0x03000000',
      }],
    }
    jest.spyOn(adapter, 'prepareUpgrade').mockResolvedValue(prepared)
    const propose = jest.spyOn(adapter, 'createSquadsProposal').mockResolvedValue({
      signature: 'proposal-signature',
      status: 1,
      slot: 12,
      simulated: false,
      multisigAddress,
      vaultAddress,
      transactionAddress: Keypair.generate().publicKey.toBase58(),
      proposalAddress: Keypair.generate().publicKey.toBase58(),
      transactionIndex: '7',
    })
    const verify = jest.spyOn(adapter, 'verifyProgram').mockResolvedValue({
      programId,
      programDataAddress,
      authority: governance,
      artifactHash: 'artifact-hash',
      byteLength: 4,
      deploymentSlot: 12,
      currentSlot: 13,
      visible: true,
    })
    const job: Job = {
      name: 'governed-svm-program',
      version: '1',
      actions: [
        {
          name: 'reserve',
          type: 'svm-reserve-program',
          arguments: {
            stub: './stub.so',
            finalAuthority: governance,
            maxDataLength: 1_024,
          },
        },
        {
          name: 'buffer',
          type: 'svm-write-buffer',
          depends_on: ['reserve'],
          arguments: { program: './program.so', finalAuthority: governance },
        },
        {
          name: 'proposal',
          type: 'svm-squads-propose-upgrade',
          depends_on: ['buffer'],
          arguments: {
            program: './program.so',
            programId,
            bufferAddress,
            multisig: multisigAddress,
          },
        },
        {
          name: 'verify',
          type: 'svm-verify-program',
          depends_on: ['proposal'],
          arguments: { program: './program.so', programId, expectedAuthority: governance },
        },
      ],
    }

    await engine.executeJob(job, context)

    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ finalAuthority: governance, maxDataLength: 1_024 }))
    expect(writeBuffer).toHaveBeenCalledWith(expect.objectContaining({ finalAuthority: governance }))
    expect(propose).toHaveBeenCalledWith(expect.objectContaining({ multisigAddress, vaultIndex: 0 }))
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ expectedAuthority: governance, requireVisible: true }))
    expect(context.getOutput('reserve.address')).toBe(programId)
    expect(context.getOutput('buffer.address')).toBe(bufferAddress)
    expect(context.getOutput('proposal.transactionIndex')).toBe('7')
    expect(context.getOutput('verify.verified')).toBe(true)
  })

  it('rejects EVM-shaped transactions on SVM networks', async () => {
    const context = makeContext()
    const recipient = Keypair.generate().publicKey.toBase58()
    const job: Job = {
      name: 'wrong-model',
      version: '1',
      actions: [{
        name: 'evm-transfer',
        type: 'send-transaction',
        arguments: { to: recipient, value: '1', data: '0x' },
      }],
    }

    await expect(new ExecutionEngine(new Map()).executeJob(job, context)).rejects.toThrow('requires an EVM-like network')
  })
})
