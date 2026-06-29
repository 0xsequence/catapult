import { ExecutionEngine } from '../engine'
import { ExecutionContext } from '../context'
import { ContractRepository } from '../../contracts/repository'
import { Action, Network } from '../../types'
import { VerificationPlatformRegistry } from '../../verification/etherscan'

describe('Assert Action', () => {
  let engine: ExecutionEngine
  let context: ExecutionContext
  let mockNetwork: Network
  let mockRegistry: ContractRepository
  let templates: Map<string, any>

  beforeEach(() => {
    mockNetwork = { name: 'testnet', chainId: 999, rpcUrl: 'http://localhost:8545' }
    mockRegistry = new ContractRepository()

    // Create a mock context that doesn't require a real connection
    context = {
      getNetwork: () => mockNetwork,
      setOutput: jest.fn(),
      getOutput: jest.fn(),
      setContextPath: jest.fn(),
      getContextPath: jest.fn(),
      dispose: jest.fn()
    } as any

    templates = new Map()
    const verificationRegistry = new VerificationPlatformRegistry()
    engine = new ExecutionEngine(templates, { verificationRegistry })
  })

  describe('assert primitive action', () => {
    it('should pass when eq comparison is true', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-eq',
        arguments: {
          actual: '42',
          eq: '42'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(context.setOutput).toHaveBeenCalledWith('test-assert-eq.actual', '42')
    })

    it('should fail when eq comparison is false', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-fail',
        arguments: {
          actual: '42',
          eq: '99'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert failed.*actual=42.*expected=99.*op=eq/)
    })

    it('should include custom message on failure', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-msg',
        arguments: {
          actual: '10',
          eq: '20',
          message: 'balance mismatch'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert failed: balance mismatch.*actual=10.*expected=20.*op=eq/)
    })

    it('should pass neq comparison', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-neq',
        arguments: {
          actual: '10',
          neq: '20'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
      expect(context.setOutput).toHaveBeenCalledWith('test-assert-neq.actual', '10')
    })

    it('should fail neq comparison when values are equal', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-neq-fail',
        arguments: {
          actual: '10',
          neq: '10'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert failed.*op=neq/)
    })

    it('should pass gte comparison', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-gte',
        arguments: {
          actual: '100',
          gte: '50'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
      expect(context.setOutput).toHaveBeenCalledWith('test-assert-gte.actual', '100')
    })

    it('should pass gte when equal', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-gte-equal',
        arguments: {
          actual: '50',
          gte: '50'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
    })

    it('should fail gte when less', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-gte-fail',
        arguments: {
          actual: '10',
          gte: '100'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert failed.*op=gte/)
    })

    it('should pass lt comparison', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-lt',
        arguments: {
          actual: '10',
          lt: '100'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
    })

    it('should fail lt when greater', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-lt-fail',
        arguments: {
          actual: '100',
          lt: '10'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert failed.*op=lt/)
    })

    it('should pass lte comparison', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-lte',
        arguments: {
          actual: '10',
          lte: '100'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
    })

    it('should pass lte when equal', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-lte-equal',
        arguments: {
          actual: '100',
          lte: '100'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
    })

    it('should fail lte when greater', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-lte-fail',
        arguments: {
          actual: '100',
          lte: '10'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert failed.*op=lte/)
    })

    it('should pass gt comparison', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-gt',
        arguments: {
          actual: '100',
          gt: '10'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
    })

    it('should fail gt when less', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-gt-fail',
        arguments: {
          actual: '10',
          gt: '100'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert failed.*op=gt/)
    })

    it('should use `to` + `signature` form (call resolver)', async () => {
      // Mock the resolver to simulate a call returning a value
      const mockResolver = {
        resolve: jest.fn(async (value: any, ctx: any, scope: any) => {
          if (value.type === 'call') {
            return '0xDepositManagerAddress'
          }
          if (value.type === 'basic-arithmetic') {
            const [a, b] = value.arguments.values
            if (value.arguments.operation === 'eq') {
              return a === b
            }
          }
          return value
        })
      }
      ;(engine as any).resolver = mockResolver

      const action: Action = {
        type: 'assert',
        name: 'test-assert-call',
        arguments: {
          to: '0xSomeProxyAddress',
          signature: 'depositManager() returns (address)',
          eq: '0xDepositManagerAddress'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(mockResolver.resolve).toHaveBeenCalledWith(
        { type: 'call', arguments: { to: '0xSomeProxyAddress', signature: 'depositManager() returns (address)', values: [] } },
        context,
        new Map()
      )
      expect(context.setOutput).toHaveBeenCalledWith('test-assert-call.actual', '0xDepositManagerAddress')
    })

    it('should use `actual` form with read-balance resolver', async () => {
      // Mock the resolver to simulate a read-balance returning a value
      const mockResolver = {
        resolve: jest.fn(async (value: any, ctx: any, scope: any) => {
          if (value.type === 'read-balance') {
            return '1000000000000000000' // 1 ETH
          }
          if (value.type === 'basic-arithmetic') {
            const [a, b] = value.arguments.values
            if (value.arguments.operation === 'gte') {
              return BigInt(a) >= BigInt(b)
            }
          }
          return value
        })
      }
      ;(engine as any).resolver = mockResolver

      const action: Action = {
        type: 'assert',
        name: 'test-assert-read-balance',
        arguments: {
          actual: { type: 'read-balance', arguments: { address: '0xDeployer' } },
          gte: '1000000000000000000',
          message: 'deployer underfunded'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(mockResolver.resolve).toHaveBeenCalledWith(
        { type: 'read-balance', arguments: { address: '0xDeployer' } },
        context,
        new Map()
      )
      expect(context.setOutput).toHaveBeenCalledWith('test-assert-read-balance.actual', '1000000000000000000')
    })

    it('should not store outputs when action has no name', async () => {
      const action: Action = {
        type: 'assert',
        arguments: {
          actual: '42',
          eq: '42'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(context.setOutput).not.toHaveBeenCalled()
    })

    it('should not store outputs when action has custom output', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-custom',
        arguments: {
          actual: '42',
          eq: '42'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map(), true)

      // With hasCustomOutput=true, the .actual output should not be stored by the assert case
      // (the custom output handling is done elsewhere in executeAction)
      const setOutputCalls = (context.setOutput as jest.Mock).mock.calls
      const actualOutputs = setOutputCalls.filter((c: any[]) => c[0].includes('.actual'))
      expect(actualOutputs.length).toBe(0)
    })

    it('should fail when no comparator key is provided', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-no-comparator',
        arguments: {
          actual: '42'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert must have exactly one of/)
    })

    it('should fail when more than one comparator key is provided', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-multi-comparator',
        arguments: {
          actual: '42',
          eq: '42',
          gte: '1'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert must have exactly one comparator, but got: eq, gte/)
    })

    it('should resolve values from context variables', async () => {
      // Mock the resolver to simulate template variable resolution
      // returning the same value for both actual and expected
      const mockResolver = {
        resolve: jest.fn(async (value: any, ctx: any, scope: any) => {
          if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
            return 'resolved-value'
          }
          if (value.type === 'basic-arithmetic') {
            const [a, b] = value.arguments.values
            if (value.arguments.operation === 'eq') {
              return a === b
            }
          }
          return value
        })
      }
      ;(engine as any).resolver = mockResolver

      const action: Action = {
        type: 'assert',
        name: 'test-assert-context',
        arguments: {
          actual: '{{myValue}}',
          eq: '{{myExpected}}'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      // Both {{myValue}} and {{myExpected}} resolve to 'resolved-value', so eq returns true
      expect(context.setOutput).toHaveBeenCalledWith('test-assert-context.actual', 'resolved-value')
    })

    it('should handle boolean values in eq comparison', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-bool',
        arguments: {
          actual: true,
          eq: true
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
      expect(context.setOutput).toHaveBeenCalledWith('test-assert-bool.actual', true)
    })

    it('should handle large number comparisons', async () => {
      const action: Action = {
        type: 'assert',
        name: 'test-assert-large',
        arguments: {
          actual: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
          gte: '10000000000000000000000000000000000000000000000000000000000000000000000000000'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())
      expect(context.setOutput).toHaveBeenCalledWith('test-assert-large.actual', '115792089237316195423570985008687907853269984665640564039457584007913129639935')
    })

    it('should describe call form as signature in error message', async () => {
      const mockResolver = {
        resolve: jest.fn(async (value: any, ctx: any, scope: any) => {
          if (value.type === 'call') return 'wrong-address'
          if (value.type === 'basic-arithmetic') return false
          return value
        })
      }
      ;(engine as any).resolver = mockResolver

      const action: Action = {
        type: 'assert',
        name: 'test-assert-call-desc',
        arguments: {
          to: '0xProxy',
          signature: 'getOwner() returns (address)',
          eq: '0xCorrectOwner'
        }
      }

      await expect(
        (engine as any).executePrimitive(action, context, new Map())
      ).rejects.toThrow(/assert failed.*getOwner\(\) returns \(address\)/)
    })
  })
})
