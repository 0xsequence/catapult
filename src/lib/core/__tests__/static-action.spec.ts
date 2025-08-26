import { ExecutionEngine } from '../engine'
import { ExecutionContext } from '../context'
import { ContractRepository } from '../../contracts/repository'
import { Action, Network } from '../../types'
import { VerificationPlatformRegistry } from '../../verification/etherscan'

describe('Static Action', () => {
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

  describe('static primitive action', () => {
    it('should store the provided value unchanged', async () => {
      const action: Action = {
        type: 'static',
        name: 'test-static',
        arguments: {
          value: 'hello world'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(context.setOutput).toHaveBeenCalledWith('test-static.value', 'hello world')
    })

    it('should work with numeric values', async () => {
      const action: Action = {
        type: 'static',
        name: 'numeric-static',
        arguments: {
          value: 42
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(context.setOutput).toHaveBeenCalledWith('numeric-static.value', 42)
    })

    it('should work with boolean values', async () => {
      const action: Action = {
        type: 'static',
        name: 'boolean-static',
        arguments: {
          value: true
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(context.setOutput).toHaveBeenCalledWith('boolean-static.value', true)
    })

    it('should work with object values', async () => {
      const testObject = { foo: 'bar', number: 123 }
      
      // Mock the resolver to return the object unchanged
      const mockResolver = {
        resolve: jest.fn().mockResolvedValue(testObject)
      }
      ;(engine as any).resolver = mockResolver

      const action: Action = {
        type: 'static',
        name: 'object-static',
        arguments: {
          value: testObject
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(mockResolver.resolve).toHaveBeenCalledWith(testObject, context, new Map())
      expect(context.setOutput).toHaveBeenCalledWith('object-static.value', testObject)
    })

    it('should work with array values', async () => {
      const testArray = [1, 2, 3, 'test']
      const action: Action = {
        type: 'static',
        name: 'array-static',
        arguments: {
          value: testArray
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(context.setOutput).toHaveBeenCalledWith('array-static.value', testArray)
    })

    it('should not store outputs when action has no name', async () => {
      const action: Action = {
        type: 'static',
        arguments: {
          value: 'test value'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(context.setOutput).not.toHaveBeenCalled()
    })

    it('should resolve template variables from context', async () => {
      // Mock the resolver to simulate variable resolution
      const mockResolver = {
        resolve: jest.fn().mockResolvedValue('resolved value')
      }
      ;(engine as any).resolver = mockResolver

      const action: Action = {
        type: 'static',
        name: 'resolved-static',
        arguments: {
          value: '{{some_variable}}'
        }
      }

      await (engine as any).executePrimitive(action, context, new Map())

      expect(mockResolver.resolve).toHaveBeenCalledWith('{{some_variable}}', context, new Map())
      expect(context.setOutput).toHaveBeenCalledWith('resolved-static.value', 'resolved value')
    })

    it('should resolve template variables from scope', async () => {
      const scope = new Map()
      scope.set('template_var', 'scope value')

      // Mock the resolver to return the scope value
      const mockResolver = {
        resolve: jest.fn().mockResolvedValue('scope value')
      }
      ;(engine as any).resolver = mockResolver

      const action: Action = {
        type: 'static',
        name: 'scope-static',
        arguments: {
          value: '{{template_var}}'
        }
      }

      await (engine as any).executePrimitive(action, context, scope)

      expect(mockResolver.resolve).toHaveBeenCalledWith('{{template_var}}', context, scope)
      expect(context.setOutput).toHaveBeenCalledWith('scope-static.value', 'scope value')
    })
  })
})