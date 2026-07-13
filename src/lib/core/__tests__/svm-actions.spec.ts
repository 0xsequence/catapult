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

    expect(pda).toEqual({ address: expect.any(String), bump: expect.any(Number) })
    expect((context.adapter as SvmAdapter).isAddress(pda.address)).toBe(true)
    expect((context.adapter as SvmAdapter).isAddress(ata)).toBe(true)
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
