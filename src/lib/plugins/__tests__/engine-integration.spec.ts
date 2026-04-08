import { ethers } from 'ethers'
import { ContractRepository } from '../../contracts/repository'
import { ExecutionContext } from '../../core/context'
import { ExecutionEngine } from '../../core/engine'
import { ValueResolver } from '../../core/resolver'
import { DeploymentEventEmitter } from '../../events'
import { Action, Job, Network } from '../../types'
import { PluginRegistry } from '../registry'
import { CatapultPlugin, PluginActionHandler } from '../types'

describe('Plugin Integration with ExecutionEngine', () => {
  let engine: ExecutionEngine
  let context: ExecutionContext
  let registry: PluginRegistry
  let mockNetwork: Network
  let mockRegistry: ContractRepository
  let mockEventEmitter: DeploymentEventEmitter
  let capturedEvents: any[]
  let anvilProvider: ethers.JsonRpcProvider

  beforeAll(async () => {
    // Allow configuring RPC URL via environment variable for CI
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545'
    mockNetwork = { name: 'testnet', chainId: 999, rpcUrl }

    // Try to connect to the node, fail immediately if not available
    anvilProvider = new ethers.JsonRpcProvider(rpcUrl)
    await anvilProvider.getNetwork()
  })

  afterAll(async () => {
    if (anvilProvider) {
      await anvilProvider.destroy()
    }
  })

  const randomWallet = async (provider: ethers.JsonRpcProvider) => {
    const wallet = ethers.Wallet.createRandom(provider)
    // Give ETH and allow sending txs
    await provider.send('anvil_setBalance', [wallet.address, ethers.parseEther('100').toString()])
    await provider.send('anvil_impersonateAccount', [wallet.address])
    return wallet
  }

  beforeEach(async () => {
    mockRegistry = new ContractRepository()
    const wallet = await randomWallet(anvilProvider)
    context = new ExecutionContext(mockNetwork, wallet.privateKey, mockRegistry)

    capturedEvents = []
    mockEventEmitter = {
      emitEvent: jest.fn((event) => {
        capturedEvents.push(event)
      })
    } as any

    registry = new PluginRegistry()
    const templates = new Map()
    engine = new ExecutionEngine(templates, {
      eventEmitter: mockEventEmitter,
      pluginRegistry: registry
    })
  })

  afterEach(async () => {
    registry.clear()
    capturedEvents = []

    if (context) {
      try {
        await context.dispose()
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  })

  describe('executeAction with plugin handlers', () => {
    it('should execute plugin action handler', async () => {
      const mockExecute = jest.fn().mockResolvedValue(undefined)

      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: mockExecute
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {
          param1: 'value1'
        }
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      expect(mockExecute).toHaveBeenCalledTimes(1)
      const callArgs = mockExecute.mock.calls[0]
      expect(callArgs[0]).toBe(action)
      expect(callArgs[1]).toBe(context)
      expect(callArgs[2]).toBeInstanceOf(ValueResolver)
      expect(callArgs[3]).toBe(mockEventEmitter)
      expect(callArgs[4]).toBe(false) // hasCustomOutput
      expect(callArgs[5]).toBeInstanceOf(Map) // scope
    })

    it('should emit plugin_action event when executing plugin action', async () => {
      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      const pluginActionEvent = capturedEvents.find(
        e => e.type === 'plugin_action'
      )
      expect(pluginActionEvent).toBeDefined()
      expect(pluginActionEvent?.data.actionType).toBe('test-plugin/action')
      expect(pluginActionEvent?.data.pluginName).toBe('test-plugin')
    })

    it('should allow plugin to set outputs via context', async () => {
      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: async (action, context) => {
          context.setOutput(`${action.name}.address`, '0x1234567890123456789012345678901234567890')
          context.setOutput(`${action.name}.hash`, '0xabcdef')
        }
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      expect(context.getOutput('test-action.address')).toBe('0x1234567890123456789012345678901234567890')
      expect(context.getOutput('test-action.hash')).toBe('0xabcdef')
    })

    it('should pass hasCustomOutput flag when action has custom outputs', async () => {
      const mockExecute = jest.fn().mockImplementation(async (action, context) => {
        // Set the output that the custom output references
        context.setOutput(`${action.name}.address`, '0x1234567890123456789012345678901234567890')
      })

      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: mockExecute
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {},
        output: {
          customKey: '{{test-action.address}}'
        }
      } as any

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      const callArgs = mockExecute.mock.calls[0]
      expect(callArgs[4]).toBe(true) // hasCustomOutput should be true
    })

    it('should handle custom outputs after plugin execution', async () => {
      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: async (action, context) => {
          // Plugin sets its own output
          context.setOutput(`${action.name}.address`, '0x1234567890123456789012345678901234567890')
        }
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {},
        output: {
          customKey: '{{test-action.address}}'
        }
      } as any

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      // Plugin output should be set
      expect(context.getOutput('test-action.address')).toBe('0x1234567890123456789012345678901234567890')
      // Custom output should be resolved and set
      expect(context.getOutput('test-action.customKey')).toBe('0x1234567890123456789012345678901234567890')
    })

    it('should throw error when plugin action handler not found', async () => {
      // Register a plugin so plugin registry exists, but don't register the action type
      const otherPlugin: CatapultPlugin = {
        name: 'other-plugin',
        actions: [{
          type: 'other-plugin/action',
          execute: jest.fn().mockResolvedValue(undefined)
        }]
      }
      registry.register(otherPlugin, '/path/to/other-plugin', undefined)

      const action: Action = {
        type: 'non-existent-plugin/action',
        name: 'test-action',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      // When plugin registry exists but handler not found, it falls back to template lookup
      // which will throw a template not found error
      await expect(
        engine.executeJob(job, context)
      ).rejects.toThrow('Template "non-existent-plugin/action" not found')
    })

    it('should fall back to template lookup when plugin registry not available', async () => {
      // Create engine without plugin registry
      const templates = new Map()
      const engineWithoutRegistry = new ExecutionEngine(templates, {
        eventEmitter: mockEventEmitter
        // No pluginRegistry
      })

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      // When no plugin registry, it falls back to template lookup
      await expect(
        engineWithoutRegistry.executeJob(job, context)
      ).rejects.toThrow('Template "test-plugin/action" not found')
    })

    it('should emit plugin_action_failed event on handler error', async () => {
      const error = new Error('Plugin execution failed')
      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: jest.fn().mockRejectedValue(error)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await expect(
        engine.executeJob(job, context)
      ).rejects.toThrow('Plugin action "test-action" (type: test-plugin/action) failed: Plugin execution failed')

      const failedEvent = capturedEvents.find(
        e => e.type === 'plugin_action_failed'
      )
      expect(failedEvent).toBeDefined()
      expect(failedEvent?.data.actionName).toBe('test-action')
      expect(failedEvent?.data.actionType).toBe('test-plugin/action')
      expect(failedEvent?.data.error).toBe('Plugin execution failed')
    })

    it('should pass resolver to plugin handler for argument resolution', async () => {
      const mockExecute = jest.fn().mockResolvedValue(undefined)

      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: mockExecute
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {
          param: '{{some.output}}'
        }
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      const callArgs = mockExecute.mock.calls[0]
      const resolver = callArgs[2]
      expect(resolver).toBeInstanceOf(ValueResolver)
    })

    it('should pass scope to plugin handler', async () => {
      const mockExecute = jest.fn().mockResolvedValue(undefined)

      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: mockExecute
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      const callArgs = mockExecute.mock.calls[0]
      const passedScope = callArgs[5]
      // Scope is created internally by executeJob, should be a Map
      expect(passedScope).toBeInstanceOf(Map)
    })

    it('should prioritize plugin actions over templates', async () => {
      const mockExecute = jest.fn().mockResolvedValue(undefined)

      const handler: PluginActionHandler = {
        type: 'my-template', // Same name as a template
        execute: mockExecute
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      // Create engine with a template of the same name
      const templates = new Map()
      templates.set('my-template', {
        name: 'my-template',
        actions: []
      } as any)

      const engineWithTemplate = new ExecutionEngine(templates, {
        eventEmitter: mockEventEmitter,
        pluginRegistry: registry
      })

      const action: Action = {
        type: 'my-template',
        name: 'test-action',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engineWithTemplate.executeJob(job, context)

      // Should call plugin handler, not template
      expect(mockExecute).toHaveBeenCalledTimes(1)
    })

    it('should execute plugin action in job context', async () => {
      const mockExecute = jest.fn().mockResolvedValue(undefined)

      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: mockExecute
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [
          {
            name: 'test-action',
            type: 'test-plugin/action',
            arguments: {}
          }
        ]
      }

      await engine.executeJob(job, context)

      expect(mockExecute).toHaveBeenCalledTimes(1)
    })

    it('should handle plugin action with resolved arguments', async () => {
      const mockExecute = jest.fn().mockResolvedValue(undefined)

      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: mockExecute
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      // Set up context with an output
      context.setOutput('previous-action.address', '0x1111111111111111111111111111111111111111')

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {
          target: '{{previous-action.address}}'
        }
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      // Handler should receive the action with unresolved arguments
      // (resolution happens inside the handler if needed)
      const callArgs = mockExecute.mock.calls[0]
      const passedAction = callArgs[0]
      expect(passedAction.arguments.target).toBe('{{previous-action.address}}')
    })

    it('should allow plugin to emit events', async () => {
      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: async (action, context, resolver, eventEmitter) => {
          eventEmitter.emitEvent({
            type: 'custom_plugin_event',
            level: 'info',
            data: {
              message: 'Plugin executed successfully'
            }
          })
        }
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        name: 'test-action',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      const customEvent = capturedEvents.find(
        e => e.type === 'custom_plugin_event'
      )
      expect(customEvent).toBeDefined()
      expect(customEvent?.data.message).toBe('Plugin executed successfully')
    })

    it('should handle plugin action without name', async () => {
      const mockExecute = jest.fn().mockResolvedValue(undefined)

      const handler: PluginActionHandler = {
        type: 'test-plugin/action',
        execute: mockExecute
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const action: Action = {
        type: 'test-plugin/action',
        // No name
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action as any]
      }
      await engine.executeJob(job, context)

      expect(mockExecute).toHaveBeenCalledTimes(1)
      const callArgs = mockExecute.mock.calls[0]
      expect(callArgs[0]).toBe(action)
    })

    it('should handle multiple plugin actions in sequence', async () => {
      const execute1 = jest.fn().mockResolvedValue(undefined)
      const execute2 = jest.fn().mockResolvedValue(undefined)

      const handler1: PluginActionHandler = {
        type: 'plugin1/action',
        execute: execute1
      }

      const handler2: PluginActionHandler = {
        type: 'plugin2/action',
        execute: execute2
      }

      const plugin1: CatapultPlugin = {
        name: 'plugin-1',
        actions: [handler1]
      }

      const plugin2: CatapultPlugin = {
        name: 'plugin-2',
        actions: [handler2]
      }

      registry.register(plugin1, '/path/to/plugin1', undefined)
      registry.register(plugin2, '/path/to/plugin2', undefined)

      const action1: Action = {
        type: 'plugin1/action',
        name: 'action-1',
        arguments: {}
      }

      const action2: Action = {
        type: 'plugin2/action',
        name: 'action-2',
        arguments: {}
      }

      const job: Job = {
        name: 'test-job',
        version: '1',
        depends_on: [],
        actions: [action1 as any, action2 as any]
      }
      await engine.executeJob(job, context)

      expect(execute1).toHaveBeenCalledTimes(1)
      expect(execute2).toHaveBeenCalledTimes(1)
    })
  })
})

