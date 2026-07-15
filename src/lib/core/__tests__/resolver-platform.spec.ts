import { ValueResolver } from '../resolver'
import { ExecutionContext } from '../context'
import { ContractRepository } from '../../contracts/repository'
import { ComputeCreate2Value, ComputeCreateValue, Network } from '../../types'

const tronNetwork: Network = {
  name: 'Tron Nile',
  chainId: 3448148188,
  rpcUrl: 'https://nile.trongrid.io',
  platform: 'tron',
}

describe('ValueResolver platform guards', () => {
  let resolver: ValueResolver
  let context: ExecutionContext

  beforeEach(() => {
    resolver = new ValueResolver()
    context = new ExecutionContext(tronNetwork, undefined, new ContractRepository())
  })

  afterEach(async () => {
    await context.dispose()
  })

  it('rejects EVM CREATE derivation on Tron networks', async () => {
    const value: ComputeCreateValue = {
      type: 'compute-create',
      arguments: {
        deployerAddress: '0x0000000000000000000000000000000000000000',
        nonce: '0',
      },
    }

    await expect(resolver.resolve(value, context)).rejects.toThrow('compute-create: EVM address derivation is not supported on tron networks.')
  })

  it('rejects EVM CREATE2 derivation on Tron networks', async () => {
    const value: ComputeCreate2Value = {
      type: 'compute-create2',
      arguments: {
        deployerAddress: '0x0000000000000000000000000000000000000000',
        salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
        initCode: '0x00',
      },
    }

    await expect(resolver.resolve(value, context)).rejects.toThrow('compute-create2: EVM address derivation is not supported on tron networks.')
  })
})
