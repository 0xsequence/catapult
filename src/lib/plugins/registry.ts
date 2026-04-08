import { CatapultPlugin, LoadedPlugin, PluginActionHandler } from './types'

/**
 * Registry for managing loaded Catapult plugins and their action handlers.
 * 
 * The registry maintains a mapping of action types to their handlers,
 * allowing the execution engine to dispatch actions to plugin handlers.
 */
export class PluginRegistry {
  private readonly plugins: Map<string, LoadedPlugin> = new Map()
  private readonly actionHandlers: Map<string, PluginActionHandler> = new Map()

  /**
   * Register a plugin and its handlers.
   * 
   * @param plugin The plugin to register
   * @param modulePath The resolved path to the plugin module
   * @param error Optional error that occurred during loading
   */
  public register(plugin: CatapultPlugin, modulePath: string, error?: Error): void {
    // Store plugin metadata
    this.plugins.set(plugin.name, {
      plugin,
      modulePath,
      error
    })

    // If there was an error, don't register handlers
    if (error) {
      return
    }

    // Register action handlers
    if (plugin.actions) {
      for (const handler of plugin.actions) {
        if (this.actionHandlers.has(handler.type)) {
          const existingPlugin = this.findPluginByActionType(handler.type)
          throw new Error(
            `Action type "${handler.type}" is already registered by plugin "${existingPlugin?.name || 'unknown'}". ` +
            `Plugin "${plugin.name}" cannot register a duplicate action type.`
          )
        }

        // Validate handler structure
        if (!handler.type || typeof handler.type !== 'string') {
          throw new Error(`Plugin "${plugin.name}" has an action handler with invalid or missing type.`)
        }

        if (!handler.execute || typeof handler.execute !== 'function') {
          throw new Error(`Plugin "${plugin.name}" has an action handler "${handler.type}" with invalid or missing execute function.`)
        }

        this.actionHandlers.set(handler.type, handler)
      }
    }
  }

  /**
   * Unregister a plugin and remove its handlers.
   * 
   * @param pluginName The name of the plugin to unregister
   */
  public unregister(pluginName: string): void {
    const loadedPlugin = this.plugins.get(pluginName)
    if (!loadedPlugin) {
      return
    }

    // Remove action handlers registered by this plugin
    if (loadedPlugin.plugin.actions) {
      for (const handler of loadedPlugin.plugin.actions) {
        this.actionHandlers.delete(handler.type)
      }
    }

    // Remove plugin metadata
    this.plugins.delete(pluginName)
  }

  /**
   * Get an action handler by action type.
   * 
   * @param actionType The action type to look up
   * @returns The handler if found, undefined otherwise
   */
  public getActionHandler(actionType: string): PluginActionHandler | undefined {
    return this.actionHandlers.get(actionType)
  }

  /**
   * Check if an action type is registered as a plugin action.
   * 
   * @param actionType The action type to check
   * @returns True if the action type is registered
   */
  public hasActionHandler(actionType: string): boolean {
    return this.actionHandlers.has(actionType)
  }

  /**
   * Get all registered plugins.
   * 
   * @returns Map of plugin names to loaded plugin metadata
   */
  public getPlugins(): Map<string, LoadedPlugin> {
    return new Map(this.plugins)
  }

  /**
   * Get all registered action types.
   * 
   * @returns Array of action type strings
   */
  public getActionTypes(): string[] {
    return Array.from(this.actionHandlers.keys())
  }

  /**
   * Find which plugin registered a given action type.
   * 
   * @param actionType The action type to search for
   * @returns The plugin that registered this action type, or undefined
   */
  private findPluginByActionType(actionType: string): CatapultPlugin | undefined {
    for (const loadedPlugin of this.plugins.values()) {
      if (loadedPlugin.plugin.actions?.some(h => h.type === actionType)) {
        return loadedPlugin.plugin
      }
    }
    return undefined
  }

  /**
   * Clear all registered plugins and handlers.
   */
  public clear(): void {
    this.plugins.clear()
    this.actionHandlers.clear()
  }
}

