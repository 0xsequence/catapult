import { PluginRegistry } from '../registry'
import { CatapultPlugin, PluginActionHandler } from '../types'

describe('PluginRegistry', () => {
  let registry: PluginRegistry

  beforeEach(() => {
    registry = new PluginRegistry()
  })

  afterEach(() => {
    registry.clear()
  })

  describe('register', () => {
    it('should register a plugin with action handlers', () => {
      const mockHandler: PluginActionHandler = {
        type: 'test-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        actions: [mockHandler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      expect(registry.hasActionHandler('test-action')).toBe(true)
      expect(registry.getActionHandler('test-action')).toBe(mockHandler)
      expect(registry.getPlugins().has('test-plugin')).toBe(true)
    })

    it('should register a plugin without action handlers', () => {
      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        version: '1.0.0'
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      expect(registry.getPlugins().has('test-plugin')).toBe(true)
      expect(registry.getActionTypes()).toHaveLength(0)
    })

    it('should register multiple action handlers from one plugin', () => {
      const handlers: PluginActionHandler[] = [
        {
          type: 'action-1',
          execute: jest.fn().mockResolvedValue(undefined)
        },
        {
          type: 'action-2',
          execute: jest.fn().mockResolvedValue(undefined)
        }
      ]

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: handlers
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      expect(registry.hasActionHandler('action-1')).toBe(true)
      expect(registry.hasActionHandler('action-2')).toBe(true)
      expect(registry.getActionTypes()).toHaveLength(2)
    })

    it('should throw error when registering duplicate action type', () => {
      const handler1: PluginActionHandler = {
        type: 'duplicate-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const handler2: PluginActionHandler = {
        type: 'duplicate-action',
        execute: jest.fn().mockResolvedValue(undefined)
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

      expect(() => {
        registry.register(plugin2, '/path/to/plugin2', undefined)
      }).toThrow('Action type "duplicate-action" is already registered by plugin "plugin-1"')
    })

    it('should throw error when handler has invalid type', () => {
      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [
          {
            type: '' as any, // Invalid empty type
            execute: jest.fn().mockResolvedValue(undefined)
          }
        ]
      }

      expect(() => {
        registry.register(plugin, '/path/to/plugin', undefined)
      }).toThrow('Plugin "test-plugin" has an action handler with invalid or missing type')
    })

    it('should throw error when handler has non-string type', () => {
      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [
          {
            type: 123 as any, // Invalid non-string type
            execute: jest.fn().mockResolvedValue(undefined)
          }
        ]
      }

      expect(() => {
        registry.register(plugin, '/path/to/plugin', undefined)
      }).toThrow('Plugin "test-plugin" has an action handler with invalid or missing type')
    })

    it('should throw error when handler has missing execute function', () => {
      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [
          {
            type: 'test-action',
            execute: undefined as any
          }
        ]
      }

      expect(() => {
        registry.register(plugin, '/path/to/plugin', undefined)
      }).toThrow('Plugin "test-plugin" has an action handler "test-action" with invalid or missing execute function')
    })

    it('should throw error when handler has non-function execute', () => {
      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [
          {
            type: 'test-action',
            execute: 'not-a-function' as any
          }
        ]
      }

      expect(() => {
        registry.register(plugin, '/path/to/plugin', undefined)
      }).toThrow('Plugin "test-plugin" has an action handler "test-action" with invalid or missing execute function')
    })

    it('should register plugin with error but not register handlers', () => {
      const handler: PluginActionHandler = {
        type: 'test-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      const error = new Error('Loading failed')
      registry.register(plugin, '/path/to/plugin', error)

      // Plugin should be registered for tracking
      const loadedPlugin = registry.getPlugins().get('test-plugin')
      expect(loadedPlugin).toBeDefined()
      expect(loadedPlugin?.error).toBe(error)

      // But handlers should not be registered
      expect(registry.hasActionHandler('test-action')).toBe(false)
    })
  })

  describe('unregister', () => {
    it('should unregister a plugin and remove its handlers', () => {
      const handler: PluginActionHandler = {
        type: 'test-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)
      expect(registry.hasActionHandler('test-action')).toBe(true)

      registry.unregister('test-plugin')

      expect(registry.hasActionHandler('test-action')).toBe(false)
      expect(registry.getPlugins().has('test-plugin')).toBe(false)
    })

    it('should handle unregistering non-existent plugin gracefully', () => {
      expect(() => {
        registry.unregister('non-existent-plugin')
      }).not.toThrow()
    })

    it('should unregister plugin with multiple handlers', () => {
      const handlers: PluginActionHandler[] = [
        {
          type: 'action-1',
          execute: jest.fn().mockResolvedValue(undefined)
        },
        {
          type: 'action-2',
          execute: jest.fn().mockResolvedValue(undefined)
        }
      ]

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: handlers
      }

      registry.register(plugin, '/path/to/plugin', undefined)
      expect(registry.getActionTypes()).toHaveLength(2)

      registry.unregister('test-plugin')

      expect(registry.hasActionHandler('action-1')).toBe(false)
      expect(registry.hasActionHandler('action-2')).toBe(false)
      expect(registry.getActionTypes()).toHaveLength(0)
    })
  })

  describe('getActionHandler', () => {
    it('should return handler for registered action type', () => {
      const handler: PluginActionHandler = {
        type: 'test-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const retrieved = registry.getActionHandler('test-action')
      expect(retrieved).toBe(handler)
    })

    it('should return undefined for unregistered action type', () => {
      const handler = registry.getActionHandler('non-existent-action')
      expect(handler).toBeUndefined()
    })
  })

  describe('hasActionHandler', () => {
    it('should return true for registered action type', () => {
      const handler: PluginActionHandler = {
        type: 'test-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      expect(registry.hasActionHandler('test-action')).toBe(true)
    })

    it('should return false for unregistered action type', () => {
      expect(registry.hasActionHandler('non-existent-action')).toBe(false)
    })
  })

  describe('getPlugins', () => {
    it('should return all registered plugins', () => {
      const plugin1: CatapultPlugin = {
        name: 'plugin-1',
        version: '1.0.0'
      }

      const plugin2: CatapultPlugin = {
        name: 'plugin-2',
        version: '2.0.0'
      }

      registry.register(plugin1, '/path/to/plugin1', undefined)
      registry.register(plugin2, '/path/to/plugin2', undefined)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(2)
      expect(plugins.has('plugin-1')).toBe(true)
      expect(plugins.has('plugin-2')).toBe(true)
    })

    it('should return empty map when no plugins registered', () => {
      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(0)
    })

    it('should return a copy of the plugins map', () => {
      const plugin: CatapultPlugin = {
        name: 'test-plugin'
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const plugins1 = registry.getPlugins()
      const plugins2 = registry.getPlugins()

      // Should be different Map instances
      expect(plugins1).not.toBe(plugins2)
      // But should have same content
      expect(plugins1.size).toBe(plugins2.size)
    })
  })

  describe('getActionTypes', () => {
    it('should return all registered action types', () => {
      const handlers: PluginActionHandler[] = [
        {
          type: 'action-1',
          execute: jest.fn().mockResolvedValue(undefined)
        },
        {
          type: 'action-2',
          execute: jest.fn().mockResolvedValue(undefined)
        },
        {
          type: 'action-3',
          execute: jest.fn().mockResolvedValue(undefined)
        }
      ]

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: handlers
      }

      registry.register(plugin, '/path/to/plugin', undefined)

      const actionTypes = registry.getActionTypes()
      expect(actionTypes).toHaveLength(3)
      expect(actionTypes).toContain('action-1')
      expect(actionTypes).toContain('action-2')
      expect(actionTypes).toContain('action-3')
    })

    it('should return empty array when no handlers registered', () => {
      const actionTypes = registry.getActionTypes()
      expect(actionTypes).toHaveLength(0)
    })
  })

  describe('clear', () => {
    it('should clear all plugins and handlers', () => {
      const handler: PluginActionHandler = {
        type: 'test-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler]
      }

      registry.register(plugin, '/path/to/plugin', undefined)
      expect(registry.getPlugins().size).toBe(1)
      expect(registry.getActionTypes()).toHaveLength(1)

      registry.clear()

      expect(registry.getPlugins().size).toBe(0)
      expect(registry.getActionTypes()).toHaveLength(0)
      expect(registry.hasActionHandler('test-action')).toBe(false)
    })

    it('should handle clear on empty registry', () => {
      expect(() => {
        registry.clear()
      }).not.toThrow()
    })
  })

  describe('integration with multiple plugins', () => {
    it('should handle multiple plugins with different action types', () => {
      const handler1: PluginActionHandler = {
        type: 'plugin1/action1',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const handler2: PluginActionHandler = {
        type: 'plugin2/action1',
        execute: jest.fn().mockResolvedValue(undefined)
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

      expect(registry.getPlugins().size).toBe(2)
      expect(registry.getActionTypes()).toHaveLength(2)
      expect(registry.hasActionHandler('plugin1/action1')).toBe(true)
      expect(registry.hasActionHandler('plugin2/action1')).toBe(true)
    })

    it('should throw error when registering same plugin with duplicate action type', () => {
      const handler1: PluginActionHandler = {
        type: 'test-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const handler2: PluginActionHandler = {
        type: 'test-action',
        execute: jest.fn().mockResolvedValue(undefined)
      }

      const plugin: CatapultPlugin = {
        name: 'test-plugin',
        actions: [handler1]
      }

      registry.register(plugin, '/path/to/plugin', undefined)
      const firstHandler = registry.getActionHandler('test-action')

      // Register same plugin again with same action type (should throw)
      plugin.actions = [handler2]
      expect(() => {
        registry.register(plugin, '/path/to/plugin', undefined)
      }).toThrow('Action type "test-action" is already registered by plugin "test-plugin"')

      // First handler should still be registered
      expect(registry.getActionHandler('test-action')).toBe(firstHandler)
    })
  })
})

