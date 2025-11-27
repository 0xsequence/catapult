import { ExecutionContext } from '../core/context'
import { ResolutionScope, ValueResolver } from '../core/resolver'
import { DeploymentEventEmitter } from '../events'
import { Action } from '../types/actions'

/**
 * A handler function for a custom plugin action.
 * This function is called when an action with the matching type is executed.
 * 
 * @param action The action object from the YAML configuration
 * @param context The execution context providing access to network, signer, outputs, etc.
 * @param scope The local resolution scope for template arguments
 * @param resolver The value resolver for resolving action arguments
 */
export interface PluginActionHandler {
  /**
   * The action type this handler handles.
   * 
   * **Best practice**: Use a namespaced format like `"plugin-name/action-name"` 
   * to avoid conflicts and make it clear which plugin provides the action.
   * 
   * This must be unique across all loaded plugins. If another plugin registers
   * the same action type, registration will fail.
   */
  type: string

  /**
   * Execute the custom action.
   * 
   * The handler should:
   * 1. Resolve any action arguments using the provided resolver
   * 2. Perform the action's logic (e.g., deploy contract, call API, etc.)
   * 3. Emit events via `eventEmitter.emitEvent()` to provide visibility into execution
   * 4. Store outputs via `context.setOutput()` if the action has a name
   * 
   * **Output Storage**: When storing outputs, use the pattern `${action.name}.${key}` 
   * to prevent conflicts with other actions. For example:
   * ```typescript
   * if (action.name && !hasCustomOutput) {
   *   context.setOutput(`${action.name}.address`, deployedAddress)
   *   context.setOutput(`${action.name}.hash`, txHash)
   * }
   * ```
   * 
   * If `hasCustomOutput` is `true`, the action has custom outputs specified in the YAML
   * (via the `output` field). In this case, the handler should typically skip setting
   * default outputs, similar to how primitive actions behave. Catapult will handle
   * the custom outputs separately after execution.
   * 
   * @param action The action to execute
   * @param context The execution context (use `context.setOutput()` to store outputs)
   * @param resolver The value resolver for resolving action arguments
   * @param eventEmitter The event emitter for emitting deployment events
   * @param hasCustomOutput Whether custom outputs are specified for this action
   * @param scope The local resolution scope for template arguments (less commonly used)
   */
  execute: (
    action: Action,
    context: ExecutionContext,
    resolver: ValueResolver,
    eventEmitter: DeploymentEventEmitter,
    hasCustomOutput: boolean,
    scope: ResolutionScope
  ) => Promise<void>
}

/**
 * A Catapult plugin that extends the framework with custom functionality.
 * 
 * Plugins are loaded from npm packages or local files and must export
 * a default object conforming to this interface.
 */
export interface CatapultPlugin {
  /**
   * The name of the plugin (e.g., '@0xsequence/catapult-create4').
   * Used for identification and error messages.
   */
  name: string

  /**
   * Optional version string for the plugin.
   */
  version?: string

  /**
   * Array of custom action handlers provided by this plugin.
   * Each handler defines a new action type that can be used in YAML files.
   */
  actions?: PluginActionHandler[]

  // Future extensions (documented in FUTURE.md):
  // valueResolvers?: PluginValueResolver[]
  // conditions?: PluginCondition[]
  // templates?: PluginTemplate[]
  // commands?: PluginCommand[]
}

/**
 * Configuration for loading plugins.
 * This is parsed from catapult.config.{js|ts|json|yml} files.
 */
export interface PluginConfiguration {
  /**
   * Array of plugin module identifiers.
   * Can be:
   * - npm package names (e.g., '@0xsequence/catapult-create4')
   * - relative paths (e.g., './local-plugin')
   * - absolute paths (e.g., '/absolute/path/to/plugin')
   */
  plugins: string[]
}

/**
 * Metadata about a loaded plugin.
 */
export interface LoadedPlugin {
  /**
   * The plugin object
   */
  plugin: CatapultPlugin

  /**
   * The resolved module path
   */
  modulePath: string

  /**
   * Any error that occurred during loading
   */
  error?: Error
}

