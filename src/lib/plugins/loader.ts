import * as fs from 'fs/promises'
import * as path from 'path'
import { parse as parseYaml } from 'yaml'
import { PluginRegistry } from './registry'
import { CatapultPlugin, PluginConfiguration } from './types'

/**
 * Loads and registers plugins from a configuration file.
 */
export class PluginLoader {
  /**
   * Load plugins from a configuration file and register them.
   * 
   * @param configPath Path to the configuration file (optional, will search for default if not provided)
   * @param projectRoot Project root directory for resolving relative paths
   * @param registry The plugin registry to register plugins in
   */
  public static async loadPlugins(
    configPath: string | undefined,
    projectRoot: string,
    registry: PluginRegistry
  ): Promise<void> {
    // If no config path provided, try to find default config file
    if (!configPath) {
      configPath = await this.findConfigFile(projectRoot)
    }

    // If still no config file found, skip plugin loading (optional feature)
    if (!configPath) {
      return
    }

    // Load and parse configuration
    const config = await this.loadConfigFile(configPath)
    // If config file doesn't exist, skip plugin loading (graceful)
    if (!config) {
      return
    }
    // If config is invalid, throw error (configuration error)
    if (!config.plugins || !Array.isArray(config.plugins)) {
      throw new Error(
        `Invalid plugin configuration in ${configPath}: expected "plugins" array.`
      )
    }

    // Load each plugin
    for (const pluginId of config.plugins) {
      if (typeof pluginId !== 'string') {
        throw new Error(
          `Invalid plugin identifier in ${configPath}: expected string, got ${typeof pluginId}`
        )
      }

      try {
        await this.loadPlugin(pluginId, projectRoot, registry)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Failed to load plugin "${pluginId}" from ${configPath}: ${errorMessage}`
        )
      }
    }
  }

  /**
   * Find the default configuration file in the project root.
   * Tries: catapult.config.js, catapult.config.ts, catapult.config.json, catapult.config.yml, catapult.config.yaml
   */
  private static async findConfigFile(projectRoot: string): Promise<string | undefined> {
    const candidates = [
      'catapult.config.js',
      'catapult.config.ts',
      'catapult.config.json',
      'catapult.config.yml',
      'catapult.config.yaml'
    ]

    for (const candidate of candidates) {
      const fullPath = path.join(projectRoot, candidate)
      try {
        await fs.access(fullPath)
        return fullPath
      } catch {
        // File doesn't exist, try next
        continue
      }
    }

    return undefined
  }

  /**
   * Load and parse a configuration file.
   * Supports JSON, YAML, JavaScript, and TypeScript files.
   */
  private static async loadConfigFile(configPath: string): Promise<PluginConfiguration | null> {
    const ext = path.extname(configPath).toLowerCase()
    const fullPath = path.resolve(configPath)

    // Check file exists
    try {
      await fs.access(fullPath)
    } catch {
      // File doesn't exist - return null to allow graceful handling
      return null
    }

    if (ext === '.json') {
      const content = await fs.readFile(fullPath, 'utf-8')
      return JSON.parse(content) as PluginConfiguration
    }

    if (ext === '.yml' || ext === '.yaml') {
      const content = await fs.readFile(fullPath, 'utf-8')
      return parseYaml(content) as PluginConfiguration
    }

    if (ext === '.js' || ext === '.ts') {
      // For JS/TS files, use require() to load the module
      // Note: For TS files, this assumes they're either:
      // 1. Compiled to JS in a dist/ folder
      // 2. Using ts-node or similar runtime TS execution
      // 3. The project has ts-node available
      
      // Clear require cache to allow reloading (if already cached)
      try {
        const resolvedPath = require.resolve(fullPath)
        delete require.cache[resolvedPath]
      } catch {
        // File not in cache yet, that's fine
      }
      
      try {
        const module = require(fullPath)
        // Support both CommonJS (module.exports) and ES modules (default export)
        const config = module.default || module
        return config as PluginConfiguration
      } catch (error) {
        // Check if the error is "Cannot find module" - this means the file doesn't exist
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('Cannot find module') || errorMessage.includes('MODULE_NOT_FOUND')) {
          // File doesn't exist - return null to allow graceful handling
          return null
        }
        
        // If require fails for TS, try with ts-node if available
        if (ext === '.ts') {
          try {
            // Try to register ts-node if not already registered
            if (!require.extensions['.ts']) {
              // Check if ts-node is available
              try {
                require('ts-node/register')
              } catch {
                throw new Error(
                  `Cannot load TypeScript config file ${configPath}. ` +
                  `Install ts-node or compile the file to JavaScript.`
                )
              }
            }
            // Clear cache and try again
            try {
              const resolvedPath = require.resolve(fullPath)
              delete require.cache[resolvedPath]
            } catch {
              // File not in cache yet, that's fine
            }
            const module = require(fullPath)
            const config = module.default || module
            return config as PluginConfiguration
          } catch (tsError) {
            const tsErrorMessage = tsError instanceof Error ? tsError.message : String(tsError)
            if (tsErrorMessage.includes('Cannot find module') || tsErrorMessage.includes('MODULE_NOT_FOUND')) {
              // File doesn't exist - return null to allow graceful handling
              return null
            }
            throw new Error(
              `Failed to load TypeScript config file ${configPath}: ` +
              tsErrorMessage
            )
          }
        }
        throw error
      }
    }

    throw new Error(
      `Unsupported configuration file format: ${ext}. ` +
      `Supported formats: .json, .yml, .yaml, .js, .ts`
    )
  }

  /**
   * Load a single plugin module and register it.
   */
  private static async loadPlugin(
    pluginId: string,
    projectRoot: string,
    registry: PluginRegistry
  ): Promise<void> {
    // Resolve plugin module path
    const modulePath = await this.resolvePluginPath(pluginId, projectRoot)

    // Load the plugin module
    let plugin: CatapultPlugin
    let error: Error | undefined

    try {
      // Clear require cache to allow reloading
      delete require.cache[require.resolve(modulePath)]
      
      const module = require(modulePath)
      
      // Support both CommonJS (module.exports) and ES modules (default export)
      const pluginExport = module.default || module
      
      // Validate plugin structure
      if (!pluginExport || typeof pluginExport !== 'object') {
        throw new Error(`Plugin module must export an object, got ${typeof pluginExport}`)
      }

      if (!pluginExport.name || typeof pluginExport.name !== 'string') {
        throw new Error(`Plugin must have a "name" property (string)`)
      }

      plugin = pluginExport as CatapultPlugin
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
      // Create a minimal plugin object for error tracking
      plugin = {
        name: pluginId,
        actions: []
      }
    }

    // Register the plugin (even if there was an error, for tracking)
    registry.register(plugin, modulePath, error)

    // If there was an error, rethrow it
    if (error) {
      throw error
    }
  }

  /**
   * Resolve the path to a plugin module.
   * Supports npm packages, relative paths, and absolute paths.
   */
  private static async resolvePluginPath(
    pluginId: string,
    projectRoot: string
  ): Promise<string> {
    // If it's an absolute path, use it directly
    if (path.isAbsolute(pluginId)) {
      return pluginId
    }

    // If it starts with ./ or ../, treat as relative path
    if (pluginId.startsWith('./') || pluginId.startsWith('../')) {
      return path.resolve(projectRoot, pluginId)
    }

    // Otherwise, try to resolve as npm package using require.resolve
    // This searches node_modules starting from projectRoot and parent directories
    try {
      return require.resolve(pluginId, { paths: [projectRoot] })
    } catch {
      throw new Error(
        `Cannot resolve plugin "${pluginId}". ` +
        `Make sure it's installed in node_modules or provide a valid path.`
      )
    }
  }
}

