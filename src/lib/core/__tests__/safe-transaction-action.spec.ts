import { ExecutionEngine } from '../engine'
import { Action, isPrimitiveActionType, Network } from '../../types'
import { SAFE_TRANSACTION_SCHEMA } from '../../safe'

describe('Safe transaction action', () => {
  const safe = '0x1111111111111111111111111111111111111111'
  const to = '0x2222222222222222222222222222222222222222'
  const network: Network = { name: 'mainnet', chainId: 1, rpcUrl: 'http://localhost:8545' }

  let engine: ExecutionEngine
  let context: any

  beforeEach(() => {
    context = {
      provider: { call: jest.fn().mockResolvedValue('0x') },
      getNetwork: () => network,
      setOutput: jest.fn(),
    }
    engine = new ExecutionEngine(new Map())
  })

  it('is registered as a primitive action', () => {
    expect(isPrimitiveActionType('safe-transaction')).toBe(true)
  })

  it('validates, simulates, and stores a canonical artifact plus compatibility outputs', async () => {
    const action: Action = {
      type: 'safe-transaction',
      name: 'upgrade',
      arguments: {
        safe,
        to,
        value: '0x10',
        data: '0x1234',
      },
    }

    await (engine as any).executePrimitive(action, context, new Map())

    expect(context.provider.call).toHaveBeenCalledWith({
      from: safe,
      to,
      value: 16n,
      data: '0x1234',
    })

    expect(context.setOutput).toHaveBeenCalledWith('upgrade.safeTransaction', {
      schema: SAFE_TRANSACTION_SCHEMA,
      chainId: '1',
      safe,
      to,
      value: '16',
      data: '0x1234',
      operation: 0,
    })
    expect(context.setOutput).toHaveBeenCalledWith('upgrade.safeTxTo', to)
    expect(context.setOutput).toHaveBeenCalledWith('upgrade.safeTxValue', '16')
    expect(context.setOutput).toHaveBeenCalledWith('upgrade.safeTxData', '0x1234')
    expect(context.setOutput).toHaveBeenCalledWith('upgrade.safeTxOperation', 0)
    expect(context.setOutput).toHaveBeenCalledWith('upgrade.executorMultisig', safe)
  })

  it('uses zero-value CALL defaults', async () => {
    const action: Action = {
      type: 'safe-transaction',
      name: 'call',
      arguments: { safe, to },
    }

    await (engine as any).executePrimitive(action, context, new Map())

    expect(context.provider.call).toHaveBeenCalledWith({ from: safe, to, value: 0n, data: '0x' })
    expect(context.setOutput).toHaveBeenCalledWith('call.safeTxOperation', 0)
  })

  it('can emit a DELEGATECALL only when inner-call simulation is disabled', async () => {
    const action: Action = {
      type: 'safe-transaction',
      name: 'delegate',
      arguments: { safe, to, operation: 1, simulate: false },
    }

    await (engine as any).executePrimitive(action, context, new Map())

    expect(context.provider.call).not.toHaveBeenCalled()
    expect(context.setOutput).toHaveBeenCalledWith('delegate.safeTxOperation', 1)
  })

  it('rejects DELEGATECALL inner-call simulation', async () => {
    const action: Action = {
      type: 'safe-transaction',
      name: 'delegate',
      arguments: { safe, to, operation: 1 },
    }

    await expect((engine as any).executePrimitive(action, context, new Map()))
      .rejects.toThrow('DELEGATECALL cannot be simulated')
  })

  it('rejects non-EVM networks explicitly', async () => {
    context.getNetwork = () => ({ ...network, platform: 'svm' })
    const action: Action = {
      type: 'safe-transaction',
      name: 'unsupported',
      arguments: { safe, to },
    }

    await expect((engine as any).executePrimitive(action, context, new Map()))
      .rejects.toThrow('only supported on EVM networks')
    expect(context.provider.call).not.toHaveBeenCalled()
  })

  it.each([
    [{ safe: 'not-an-address', to }, 'safe is not a valid EVM address'],
    [{ safe, to: '0x1234' }, 'to is not a valid EVM address'],
    [{ safe, to, value: '-1' }, "Invalid 'value'"],
    [{ safe, to, data: '0x123' }, 'data must contain complete bytes'],
    [{ safe, to, operation: 2 }, 'operation must be 0'],
    [{ safe, to, operation: false }, 'operation must be numeric'],
    [{ safe, to, simulate: 'true' }, 'simulate must resolve to a boolean'],
  ])('rejects invalid arguments %#', async (argumentsValue, message) => {
    const action: Action = {
      type: 'safe-transaction',
      name: 'invalid',
      arguments: argumentsValue as any,
    }

    await expect((engine as any).executePrimitive(action, context, new Map())).rejects.toThrow(message)
  })

  it('does not emit an artifact when simulation reverts', async () => {
    context.provider.call.mockRejectedValue(new Error('execution reverted'))
    const action: Action = {
      type: 'safe-transaction',
      name: 'reverting',
      arguments: { safe, to },
    }

    await expect((engine as any).executePrimitive(action, context, new Map()))
      .rejects.toThrow('execution reverted')
    expect(context.setOutput).not.toHaveBeenCalled()
  })

  it('requires an action name', async () => {
    const action: Action = { type: 'safe-transaction', arguments: { safe, to } }

    await expect((engine as any).executePrimitive(action, context, new Map()))
      .rejects.toThrow('name is required')
  })
})
