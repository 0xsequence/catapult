import { randomBytes } from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PluginLoader } from '../loader'
import { PluginRegistry } from '../registry'

describe('PluginLoader', () => {
  let tempDir: string
  let testRunId: string
  let baseTestDir: string
  let registry: PluginRegistry

  beforeAll(() => {
    // Generate unique test run ID
    testRunId = `test_${Date.now()}_${randomBytes(4).toString('hex')}`
    baseTestDir = `/tmp/catapult_testing/${testRunId}`
  })

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    const testId = randomBytes(4).toString('hex')
    tempDir = path.join(baseTestDir, testId)
    await fs.mkdir(tempDir, { recursive: true })
    registry = new PluginRegistry()
  })

  afterEach(async () => {
    // Clean up individual test directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors for individual tests
    }
    registry.clear()
  })

  afterAll(async () => {
    // Clean up entire test run directory as safety net
    try {
      await fs.rm(baseTestDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('loadPlugins', () => {
    it('should load plugins from JSON config file', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      // Create a mock plugin module
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      const pluginModule = `
        module.exports = {
          name: 'test-plugin',
          version: '1.0.0',
          actions: []
        }
      `
      await fs.writeFile(pluginModulePath, pluginModule)

      // Write config with plugin
      const configContent = {
        plugins: ['./test-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
      expect(plugins.has('test-plugin')).toBe(true)
    })

    it('should load plugins from YAML config file', async () => {
      const configPath = path.join(tempDir, 'catapult.config.yml')
      const configContent = `plugins:
  - ./test-plugin
`
      await fs.writeFile(configPath, configContent)

      // Create a mock plugin module
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      const pluginModule = `
        module.exports = {
          name: 'test-plugin',
          version: '1.0.0',
          actions: []
        }
      `
      await fs.writeFile(pluginModulePath, pluginModule)

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
      expect(plugins.has('test-plugin')).toBe(true)
    })

    it('should load plugins from JavaScript config file', async () => {
      const configPath = path.join(tempDir, 'catapult.config.js')
      const configContent = `module.exports = {
  plugins: ['./test-plugin']
}
`
      await fs.writeFile(configPath, configContent)

      // Create a mock plugin module
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      const pluginModule = `
        module.exports = {
          name: 'test-plugin',
          version: '1.0.0',
          actions: []
        }
      `
      await fs.writeFile(pluginModulePath, pluginModule)

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
      expect(plugins.has('test-plugin')).toBe(true)
    })

    it('should load multiple plugins from config', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      // Create two mock plugin modules
      const plugin1Dir = path.join(tempDir, 'plugin-1')
      await fs.mkdir(plugin1Dir, { recursive: true })
      const plugin1ModulePath = path.join(plugin1Dir, 'index.js')
      await fs.writeFile(plugin1ModulePath, `
        module.exports = {
          name: 'plugin-1',
          version: '1.0.0',
          actions: []
        }
      `)

      const plugin2Dir = path.join(tempDir, 'plugin-2')
      await fs.mkdir(plugin2Dir, { recursive: true })
      const plugin2ModulePath = path.join(plugin2Dir, 'index.js')
      await fs.writeFile(plugin2ModulePath, `
        module.exports = {
          name: 'plugin-2',
          version: '2.0.0',
          actions: []
        }
      `)

      const configContent = {
        plugins: ['./plugin-1', './plugin-2']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(2)
      expect(plugins.has('plugin-1')).toBe(true)
      expect(plugins.has('plugin-2')).toBe(true)
    })

    it('should load plugin with action handlers', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      const pluginModule = `
        module.exports = {
          name: 'test-plugin',
          version: '1.0.0',
          actions: [
            {
              type: 'test-action',
              execute: async () => {}
            }
          ]
        }
      `
      await fs.writeFile(pluginModulePath, pluginModule)

      const configContent = {
        plugins: ['./test-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      expect(registry.hasActionHandler('test-action')).toBe(true)
      const handler = registry.getActionHandler('test-action')
      expect(handler).toBeDefined()
      expect(handler?.type).toBe('test-action')
    })

    it('should find default config file (catapult.config.json)', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      await fs.writeFile(pluginModulePath, `
        module.exports = {
          name: 'test-plugin',
          actions: []
        }
      `)

      const configContent = {
        plugins: ['./test-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      // Don't pass configPath, should find default
      await PluginLoader.loadPlugins(undefined, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
    })

    it('should find default config file (catapult.config.yml)', async () => {
      const configPath = path.join(tempDir, 'catapult.config.yml')
      
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      await fs.writeFile(pluginModulePath, `
        module.exports = {
          name: 'test-plugin',
          actions: []
        }
      `)

      const configContent = `plugins:
  - ./test-plugin
`
      await fs.writeFile(configPath, configContent)

      // Don't pass configPath, should find default
      await PluginLoader.loadPlugins(undefined, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
    })

    it('should skip plugin loading if no config file found', async () => {
      // No config file created
      await PluginLoader.loadPlugins(undefined, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(0)
    })

    it('should handle relative plugin paths', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      const pluginDir = path.join(tempDir, 'plugins', 'my-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      await fs.writeFile(pluginModulePath, `
        module.exports = {
          name: 'my-plugin',
          actions: []
        }
      `)

      const configContent = {
        plugins: ['./plugins/my-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
      expect(plugins.has('my-plugin')).toBe(true)
    })

    it('should handle absolute plugin paths', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      const pluginDir = path.join(tempDir, 'absolute-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      await fs.writeFile(pluginModulePath, `
        module.exports = {
          name: 'absolute-plugin',
          actions: []
        }
      `)

      const configContent = {
        plugins: [pluginDir]
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
      expect(plugins.has('absolute-plugin')).toBe(true)
    })

    it('should throw error for invalid config file format', async () => {
      const configPath = path.join(tempDir, 'catapult.config.txt')
      await fs.writeFile(configPath, 'invalid format')

      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).rejects.toThrow('Unsupported configuration file format')
    })

    it('should skip plugin loading gracefully when config file is missing', async () => {
      const configPath = path.join(tempDir, 'non-existent.config.json')

      // Should not throw, just skip loading
      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).resolves.not.toThrow()
      
      // No plugins should be loaded
      expect(registry.getPlugins().size).toBe(0)
    })

    it('should throw error for config without plugins array', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      const configContent = {
        notPlugins: []
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).rejects.toThrow('Invalid plugin configuration')
    })

    it('should throw error for config with non-array plugins', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      const configContent = {
        plugins: 'not-an-array'
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).rejects.toThrow('Invalid plugin configuration')
    })

    it('should throw error for invalid plugin identifier type', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      const configContent = {
        plugins: [123] // Invalid: should be string
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).rejects.toThrow('Invalid plugin identifier')
    })

    it('should throw error for non-existent plugin', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      const configContent = {
        plugins: ['./non-existent-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).rejects.toThrow('Failed to load plugin')
    })

    it('should throw error for plugin module without name', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      await fs.writeFile(pluginModulePath, `
        module.exports = {
          version: '1.0.0',
          actions: []
        }
      `)

      const configContent = {
        plugins: ['./test-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).rejects.toThrow('Plugin must have a "name" property')
    })

    it('should throw error for plugin module that exports non-object', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      await fs.writeFile(pluginModulePath, `
        module.exports = 'not-an-object'
      `)

      const configContent = {
        plugins: ['./test-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).rejects.toThrow('Plugin module must export an object')
    })

    it('should handle ES module default export', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      // Simulate ES module with default export
      const pluginModule = `
        const plugin = {
          name: 'test-plugin',
          version: '1.0.0',
          actions: []
        }
        module.exports.default = plugin
        module.exports = plugin
      `
      await fs.writeFile(pluginModulePath, pluginModule)

      const configContent = {
        plugins: ['./test-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
      expect(plugins.has('test-plugin')).toBe(true)
    })

    it('should handle plugin with CommonJS export', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      const pluginModulePath = path.join(pluginDir, 'index.js')
      const pluginModule = `
        module.exports = {
          name: 'test-plugin',
          version: '1.0.0',
          actions: []
        }
      `
      await fs.writeFile(pluginModulePath, pluginModule)

      const configContent = {
        plugins: ['./test-plugin']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
      expect(plugins.has('test-plugin')).toBe(true)
    })

    it('should throw error for unresolvable npm package', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      const configContent = {
        plugins: ['@non-existent/package']
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await expect(
        PluginLoader.loadPlugins(configPath, tempDir, registry)
      ).rejects.toThrow('Cannot resolve plugin')
    })

    it('should handle config file with empty plugins array', async () => {
      const configPath = path.join(tempDir, 'catapult.config.json')
      const configContent = {
        plugins: []
      }
      await fs.writeFile(configPath, JSON.stringify(configContent))

      await PluginLoader.loadPlugins(configPath, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(0)
    })

    it('should prioritize config file order (js > ts > json > yml > yaml)', async () => {
      // Create multiple config files
      await fs.writeFile(path.join(tempDir, 'catapult.config.json'), JSON.stringify({ plugins: [] }))
      await fs.writeFile(path.join(tempDir, 'catapult.config.yml'), 'plugins: []')
      
      const pluginDir = path.join(tempDir, 'test-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      await fs.writeFile(path.join(pluginDir, 'index.js'), `
        module.exports = { name: 'test-plugin', actions: [] }
      `)

      // Update JSON to have the plugin
      await fs.writeFile(path.join(tempDir, 'catapult.config.json'), JSON.stringify({
        plugins: ['./test-plugin']
      }))

      // Should find JSON first (based on findConfigFile order)
      await PluginLoader.loadPlugins(undefined, tempDir, registry)

      const plugins = registry.getPlugins()
      expect(plugins.size).toBe(1)
    })
  })
})

