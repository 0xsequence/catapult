import { Job, Template, Action, JobAction, isPrimitiveActionType, Condition } from '../types'
import { Contract } from '../types/contracts'
import { ExecutionContext } from './context'
import { ValueResolver, ResolutionScope } from './resolver'
import { validateAddress, validateHexData, validateBigNumberish, validateRawTransaction } from '../utils/validation'
import { DeploymentEventEmitter, deploymentEvents } from '../events'
import { createDefaultVerificationRegistry, VerificationPlatformRegistry } from '../verification/etherscan'
import { BuildInfo } from '../types/buildinfo'
import { ethers } from 'ethers'

export type EngineOptions = {
  eventEmitter?: DeploymentEventEmitter
  verificationRegistry?: VerificationPlatformRegistry
  noPostCheckConditions?: boolean
  allowMultipleNicksMethodTests?: boolean
  ignoreVerifyErrors?: boolean
}

/**
 * The ExecutionEngine is the core component that runs jobs and their actions.
 * It interprets the declarative YAML files, resolves values, interacts with the
 * blockchain, and manages the overall execution flow.
 */
export class ExecutionEngine {
  private readonly resolver: ValueResolver
  private readonly templates: Map<string, Template>
  private readonly events: DeploymentEventEmitter
  private readonly verificationRegistry: VerificationPlatformRegistry
  private readonly noPostCheckConditions: boolean
  private readonly allowMultipleNicksMethodTests: boolean
  private readonly ignoreVerifyErrors: boolean
  private nicksMethodResult: boolean | undefined
  private verificationWarnings: Array<{
    actionName: string
    address: string
    contractName: string
    platform: string
    error: string
    jobName?: string
    networkName?: string
  }> = []

  constructor(templates: Map<string, Template>, options?: EngineOptions) {
    this.resolver = new ValueResolver()
    this.templates = templates
    this.events = options?.eventEmitter || deploymentEvents
    this.verificationRegistry = options?.verificationRegistry || createDefaultVerificationRegistry()
    this.noPostCheckConditions = options?.noPostCheckConditions ?? false
    this.allowMultipleNicksMethodTests = options?.allowMultipleNicksMethodTests ?? false
    this.ignoreVerifyErrors = options?.ignoreVerifyErrors ?? false
  }

  /**
   * Computes retry configuration for post-execution checks, tuned for local vs public networks.
   * Local (anvil/hardhat): 50ms delay for ~5s total (100 retries => 101 attempts)
   * Public: 2000ms delay for ~30s total (15 retries => 16 attempts)
   */
  private getPostCheckRetryConfig(context: ExecutionContext): { retries: number; delayMs: number } {
    const network = context.getNetwork()
    const isLocal =
      network.chainId === 31337 ||
      network.chainId === 1337 ||
      /localhost|127\.0\.0\.1/i.test(network.rpcUrl)

    if (isLocal) {
      return { retries: 100, delayMs: 50 }
    }
    return { retries: 15, delayMs: 2000 }
  }

  /**
   * Executes a single job against a given network context.
   * @param job The Job object to execute.
   * @param context The ExecutionContext for the target network.
   */
  public async executeJob(job: Job, context: ExecutionContext): Promise<void> {
    this.events.emitEvent({
      type: 'job_started',
      level: 'info',
      data: {
        jobName: job.name,
        jobVersion: job.version,
        networkName: context.getNetwork().name,
        chainId: context.getNetwork().chainId
      }
    })

    // Set context path for relative artifact resolution
    const previousContextPath = context.getContextPath()
    context.setContextPath(job._path)

    try {
      const executionOrder = this.topologicalSortActions(job)

      for (const actionName of executionOrder) {
        const action = job.actions.find(a => a.name === actionName)
        if (!action) {
          // This should be unreachable if topological sort is correct
          throw new Error(`Internal error: Action "${actionName}" not found in job "${job.name}".`)
        }
        await this.executeAction(action, context, new Map())
      }

      // If post-check conditions are enabled, re-evaluate job-level skip conditions with retry to handle RPC propagation lag
      if (!this.noPostCheckConditions && job.skip_condition) {
        const { retries, delayMs } = this.getPostCheckRetryConfig(context)
        const shouldSkip = await this.retryBooleanCheck(
          async () => this.evaluateSkipConditions(job.skip_condition!, context, new Map()),
          retries,
          delayMs
        )
        if (!shouldSkip) {
          // If skip conditions don't evaluate to true after execution, the job failed
          throw new Error(`Job "${job.name}" failed post-execution check: skip conditions did not evaluate to true`)
        }
      }
    } finally {
      // Restore previous context path
      context.setContextPath(previousContextPath)
    }

    this.events.emitEvent({
      type: 'job_completed',
      level: 'info',
      data: {
        jobName: job.name,
        networkName: context.getNetwork().name,
        chainId: context.getNetwork().chainId
      }
    })
  }

  /**
   * The central dispatcher for executing any action, whether it's a primitive
   * or a call to another template.
   * @param action The action to execute.
   * @param context The global execution context.
   * @param scope The local resolution scope, used for template arguments.
   */
  private async executeAction(
    action: JobAction | Action,
    context: ExecutionContext,
    scope: ResolutionScope,
  ): Promise<void> {
    const actionName = 'name' in action ? action.name : action.type
    // For JobAction, get template or type; for Action, get type
    const templateName = 'template' in action 
      ? (action.template || action.type) 
      : action.type
    
    if (!templateName) {
      throw new Error(`Action "${actionName}": missing both template and type fields`)
    }
    
    // Emit action start with a guaranteed, meaningful name
    const printableName =
      (typeof actionName === 'string' && actionName.trim().length > 0)
        ? actionName
        : (isPrimitiveActionType(templateName) ? templateName : `template:${templateName}`)
    this.events.emitEvent({
      type: 'action_started',
      level: 'info',
      data: {
        actionName: printableName,
        jobName: 'unknown' // We'll need to pass job context later
      }
    })

    // 1. Evaluate skip conditions for the action itself.
    const shouldSkip = await this.evaluateSkipConditions(action.skip_condition, context, scope)
    if (shouldSkip) {
      this.events.emitEvent({
        type: 'action_skipped',
        level: 'info',
        data: {
          actionName: actionName,
          reason: 'condition met'
        }
      })
      
      // Process static outputs even when action is skipped
      // This is important for static outputs that don't depend on action execution
      const hasCustomOutput = 'name' in action && action.name &&
        (action as any).output &&
        typeof (action as any).output === 'object' &&
        !Array.isArray((action as any).output)
      
      if (hasCustomOutput) {
        const customOutput = (action as any).output
        // Custom output map provided by job action: resolve each mapping within the current scope
        for (const [key, value] of Object.entries(customOutput)) {
          const resolvedOutput = await this.resolver.resolve(value as any, context, scope)
          const outputKey = `${action.name}.${key}`
          context.setOutput(outputKey, resolvedOutput)
          this.events.emitEvent({
            type: 'output_stored',
            level: 'debug',
            data: {
              outputKey,
              value: resolvedOutput
            }
          })
        }
      }
      
      return
    }

    // 2. Differentiate between a primitive action and a template call.
    if (isPrimitiveActionType(templateName)) {
      // Check if custom outputs are specified
      const hasCustomOutput = 'name' in action && action.name &&
        (action as any).output &&
        typeof (action as any).output === 'object' &&
        !Array.isArray((action as any).output)
      
      // Convert JobAction to Action for primitive execution
      const primitiveAction: Action = 'template' in action
        ? {
            type: (action.type || action.template) as any,
            name: action.name,
            arguments: action.arguments,
            skip_condition: action.skip_condition,
            depends_on: action.depends_on
          }
        : action as Action
      
      // Execute primitive with information about custom outputs
      await this.executePrimitive(primitiveAction, context, scope, hasCustomOutput)
      
      // Handle custom outputs for primitive actions (similar to template logic)
      if (hasCustomOutput) {
        const customOutput = (action as any).output
        // Custom output map provided by job action: resolve each mapping within the current scope
        for (const [key, value] of Object.entries(customOutput)) {
          const resolvedOutput = await this.resolver.resolve(value as any, context, scope)
          const outputKey = `${action.name}.${key}`
          context.setOutput(outputKey, resolvedOutput)
          this.events.emitEvent({
            type: 'output_stored',
            level: 'debug',
            data: {
              outputKey,
              value: resolvedOutput
            }
          })
        }
      }
    } else {
      await this.executeTemplate(action, templateName, context, scope)
    }
  }

  /**
   * Executes a template, including its setup, skip conditions, actions, and outputs.
   * @param callingAction The action from the parent job/template that is calling this template.
   * @param templateName The name of the template to execute.
   * @param context The global execution context.
   */
  private async executeTemplate(
    callingAction: JobAction | Action,
    templateName: string,
    context: ExecutionContext,
    parentScope: ResolutionScope = new Map(),
  ): Promise<void> {
    const template = this.templates.get(templateName)
    if (!template) {
      const actionName = 'name' in callingAction ? callingAction.name : callingAction.type
      throw new Error(`Template "${templateName}" not found for action "${actionName}".`)
    }
    this.events.emitEvent({
      type: 'template_entered',
      level: 'debug',
      data: {
        templateName: template.name
      }
    })

    // 1. Create and populate a new resolution scope for this template call.
    // NOTE: We resolve arguments in the CURRENT context (which should be the job's context)
    // before changing to the template's context. This ensures artifact references in
    // job arguments are resolved relative to the job, not the template.
    const templateScope: ResolutionScope = new Map()
    if ('arguments' in callingAction) {
      for (const [key, value] of Object.entries(callingAction.arguments)) {
        // Resolve the argument value in the parent's context, preserving the caller's local scope
        // so that template arguments from the caller are available when invoking nested templates.
        const resolvedValue = await this.resolver.resolve(value, context, parentScope)
        templateScope.set(key, resolvedValue)
      }
    }

    // Set context path for relative artifact resolution within the template
    const previousContextPath = context.getContextPath()
    context.setContextPath(template._path)

    try {
    
    // 2. Handle template-level setup block.
    if (template.setup) {
      // Check setup skip conditions before executing setup actions
      if (template.setup.skip_condition && await this.evaluateSkipConditions(template.setup.skip_condition, context, templateScope)) {
        this.events.emitEvent({
          type: 'template_setup_skipped',
          level: 'info',
          data: {
            templateName: template.name,
            reason: 'setup skip condition met'
          }
        })
      } else if (template.setup.actions) {
        this.events.emitEvent({
          type: 'template_setup_started',
          level: 'debug',
          data: {
            templateName: template.name
          }
        })
        for (const setupAction of template.setup.actions) {
          // Setup actions are executed with the new template scope.
          await this.executeAction(setupAction, context, templateScope)
        }
        this.events.emitEvent({
          type: 'template_setup_completed',
          level: 'debug',
          data: {
            templateName: template.name
          }
        })
      }
    }

    // 3. Evaluate template-level skip conditions.
    const templateSkipConditions = template.skip_condition
    const templateShouldSkip = await this.evaluateSkipConditions(templateSkipConditions, context, templateScope)
    if (templateShouldSkip) {
      this.events.emitEvent({
        type: 'template_skipped',
        level: 'info',
        data: {
          templateName: template.name,
          reason: 'condition met'
        }
      })
      // Even if we skip the main actions, we must still process the outputs,
      // as they might be pre-computable (e.g., a CREATE2 address).
    } else {
      // 4. Execute the main actions within the template.
      for (const templateAction of template.actions) {
        await this.executeAction(templateAction, context, templateScope)
      }
    }

    // If post-check conditions are enabled, re-evaluate template-level skip conditions with retry to handle RPC propagation lag
    if (!this.noPostCheckConditions && template.skip_condition) {
      const { retries, delayMs } = this.getPostCheckRetryConfig(context)
      const shouldSkip = await this.retryBooleanCheck(
        async () => this.evaluateSkipConditions(template.skip_condition!, context, templateScope),
        retries,
        delayMs
      )
      if (!shouldSkip) {
        // If skip conditions don't evaluate to true after execution, the template failed
        throw new Error(`Template "${template.name}" failed post-execution check: skip conditions did not evaluate to true`)
      }
    }

    // 5. Resolve and store the template's outputs into the global context.
    // If the calling action (job action) specified a custom "output" map, that overrides the template outputs.
    if ('name' in callingAction) {
      const actionName = callingAction.name
      const customOutput = (callingAction as any).output
      if (customOutput && typeof customOutput === 'object' && !Array.isArray(customOutput)) {
        // Custom output map provided by job action: resolve each mapping within the template scope
        for (const [key, value] of Object.entries(customOutput)) {
          const resolvedOutput = await this.resolver.resolve(value as any, context, templateScope)
          const outputKey = `${actionName}.${key}`
          context.setOutput(outputKey, resolvedOutput)
          this.events.emitEvent({
            type: 'output_stored',
            level: 'debug',
            data: {
              outputKey,
              value: resolvedOutput
            }
          })
        }
      } else if (template.outputs) {
        // Default behavior: use template-defined outputs
        for (const [key, value] of Object.entries(template.outputs)) {
          const resolvedOutput = await this.resolver.resolve(value, context, templateScope)
          const outputKey = `${actionName}.${key}`
          context.setOutput(outputKey, resolvedOutput)
          this.events.emitEvent({
            type: 'output_stored',
            level: 'debug',
            data: {
              outputKey,
              value: resolvedOutput
            }
          })
        }
      }
    }

    this.events.emitEvent({
      type: 'template_exited',
      level: 'debug',
      data: {
        templateName: template.name
      }
    })
  } finally {
    // Restore previous context path
    context.setContextPath(previousContextPath)
  }
}

  /**
   * Executes a primitive, built-in action.
   * @param action The primitive action to execute.
   * @param context The global execution context.
   * @param scope The local resolution scope.
   * @param hasCustomOutput Whether custom outputs are specified for this action.
   */
  private async executePrimitive(
    action: Action,
    context: ExecutionContext,
    scope: ResolutionScope,
    hasCustomOutput: boolean = false,
  ): Promise<void> {
    const actionName = action.name || action.type
    this.events.emitEvent({
      type: 'primitive_action',
      level: 'debug',
      data: {
        actionType: action.type
      }
    })

    switch (action.type) {
      case 'send-transaction': {
        const resolvedTo = await this.resolver.resolve(action.arguments.to, context, scope)
        const resolvedData = action.arguments.data ? await this.resolver.resolve(action.arguments.data, context, scope) : '0x'
        const resolvedValue = action.arguments.value ? await this.resolver.resolve(action.arguments.value, context, scope) : 0
        const resolvedGasMultiplier = action.arguments.gasMultiplier !== undefined ? await this.resolver.resolve(action.arguments.gasMultiplier, context, scope) : undefined
        
        // Validate and convert types
        const to = validateAddress(resolvedTo, actionName)
        const data = validateHexData(resolvedData, actionName, 'data')
        const value = validateBigNumberish(resolvedValue, actionName, 'value')
        
        // Validate gas multiplier if provided
        let gasMultiplier: number | undefined
        if (resolvedGasMultiplier !== undefined) {
          if (typeof resolvedGasMultiplier !== 'number' || resolvedGasMultiplier <= 0) {
            throw new Error(`Action "${actionName}": gasMultiplier must be a positive number, got: ${resolvedGasMultiplier}`)
          }
          gasMultiplier = resolvedGasMultiplier
        }
        
        // Prepare transaction parameters
        const txParams: any = { to, data, value }
        
        // Handle gas limit with optional multiplier
        const network = context.getNetwork()
        const signer = await context.getResolvedSigner()
        if (network.gasLimit) {
          const baseGasLimit = network.gasLimit
          txParams.gasLimit = gasMultiplier ? Math.floor(baseGasLimit * gasMultiplier) : baseGasLimit
        } else if (gasMultiplier) {
          // If gasMultiplier is specified but no network gasLimit, estimate gas first
          const estimatedGas = await signer.estimateGas({ to, data, value })
          txParams.gasLimit = Math.floor(Number(estimatedGas) * gasMultiplier)
        }
        
        await this.checkFundsForTransaction(actionName, txParams, context, signer)
        const tx = await signer.sendTransaction(txParams)
        
        this.events.emitEvent({
          type: 'transaction_sent',
          level: 'info',
          data: {
            to,
            value: value.toString(),
            dataPreview: String(data).substring(0, 42),
            txHash: tx.hash
          }
        })
        
        const receipt = await tx.wait()
        if (!receipt || receipt.status !== 1) {
            throw new Error(`Transaction for action "${actionName}" failed (reverted). Hash: ${tx.hash}`)
        }
        
        this.events.emitEvent({
          type: 'transaction_confirmed',
          level: 'info',
          data: {
            txHash: tx.hash,
            blockNumber: receipt.blockNumber
          }
        })
        
        if (action.name && !hasCustomOutput) {
            context.setOutput(`${action.name}.hash`, tx.hash)
            context.setOutput(`${action.name}.receipt`, receipt)
        }
        break
      }
      case 'send-signed-transaction': {
        const resolvedRawTx = await this.resolver.resolve(action.arguments.transaction, context, scope)
        
        // Validate and convert type
        const rawTx = validateRawTransaction(resolvedRawTx, actionName)
        
        const tx = await context.provider.broadcastTransaction(rawTx)
        
        this.events.emitEvent({
          type: 'transaction_sent',
          level: 'info',
          data: {
            to: '',
            value: '0',
            dataPreview: 'signed transaction',
            txHash: tx.hash
          }
        })
        
        const receipt = await tx.wait()
        if (!receipt || receipt.status !== 1) {
            throw new Error(`Signed transaction for action "${actionName}" failed (reverted). Hash: ${tx.hash}`)
        }
        
        this.events.emitEvent({
          type: 'transaction_confirmed',
          level: 'info',
          data: {
            txHash: tx.hash,
            blockNumber: receipt.blockNumber
          }
        })
        
        if (action.name && !hasCustomOutput) {
            context.setOutput(`${action.name}.hash`, tx.hash)
            context.setOutput(`${action.name}.receipt`, receipt)
        }
        break
      }
      case 'verify-contract': {
        const actionName = action.name || action.type
        
        // Resolve arguments
        const resolvedAddress = await this.resolver.resolve(action.arguments.address, context, scope)
        const resolvedContract = await this.resolver.resolve(action.arguments.contract, context, scope)
        const resolvedConstructorArgs = action.arguments.constructorArguments
          ? await this.resolver.resolve(action.arguments.constructorArguments, context, scope)
          : undefined
        const resolvedPlatform = action.arguments.platform
          ? await this.resolver.resolve(action.arguments.platform, context, scope)
          : 'all'

        // Validate inputs
        const address = validateAddress(resolvedAddress, actionName)
        
        if (!resolvedContract || typeof resolvedContract !== 'object') {
          throw new Error(`Action "${actionName}": contract must be a Contract object`)
        }

        const contract = resolvedContract as Contract

        // Handle platform validation - allow string, array of strings, or 'all'
        let platformsToTry: string[]
        if (resolvedPlatform === 'all') {
          platformsToTry = ['all']
        } else if (typeof resolvedPlatform === 'string') {
          platformsToTry = [resolvedPlatform]
        } else if (Array.isArray(resolvedPlatform)) {
          // Validate that all array elements are strings
          if (!resolvedPlatform.every(p => typeof p === 'string')) {
            throw new Error(`Action "${actionName}": platform array must contain only strings`)
          }
          platformsToTry = resolvedPlatform
        } else {
          throw new Error(`Action "${actionName}": platform must be a string, array of strings, or 'all'`)
        }

        // Validate that the contract has the necessary information for verification
        if (!contract.sourceName) {
          throw new Error(`Action "${actionName}": Contract is missing sourceName required for verification`)
        }
        if (!contract.contractName) {
          throw new Error(`Action "${actionName}": Contract is missing contractName required for verification`)
        }
        if (!contract.compiler) {
          throw new Error(`Action "${actionName}": Contract is missing compiler information required for verification`)
        }
        if (!contract.buildInfoId) {
          throw new Error(`Action "${actionName}": Contract is missing buildInfoId required for verification`)
        }

        // Validate constructor arguments if provided
        let constructorArguments: string | undefined
        if (resolvedConstructorArgs !== undefined) {
          constructorArguments = validateHexData(resolvedConstructorArgs, actionName, 'constructorArguments')
        }

        const network = context.getNetwork()
        const contractName = `${contract.sourceName}:${contract.contractName}`

        // Handle platform verification
        if (platformsToTry.includes('all')) {
          // Handle "all" platform - try all configured platforms for this network
          const configuredPlatforms = this.verificationRegistry.getConfiguredPlatforms(network)
          
          if (configuredPlatforms.length === 0) {
            this.events.emitEvent({
              type: 'action_skipped',
              level: 'warn',
              data: {
                actionName: actionName,
                reason: `No configured verification platforms available for network ${network.name}`
              }
            })
            return
          }

          // Try verification on all configured platforms
          let anySuccess = false
          for (const platform of configuredPlatforms) {
            try {
              await this.verifyOnSinglePlatform(
                platform,
                contract,
                address,
                constructorArguments,
                network,
                actionName,
                contractName,
                action,
                context,
                hasCustomOutput
              )
              anySuccess = true
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              
              // If ignoreVerifyErrors is enabled, add to warnings and continue
              if (this.ignoreVerifyErrors) {
                this.verificationWarnings.push({
                  actionName: actionName,
                  address,
                  contractName,
                  platform: platform.name,
                  error: errorMessage,
                  networkName: network.name
                })
              }
              
              // Log the error but continue with other platforms
              this.events.emitEvent({
                type: 'verification_failed',
                level: 'warn',
                data: {
                  actionName: actionName,
                  address,
                  contractName,
                  platform: platform.name,
                  error: errorMessage
                }
              })
            }
          }

          if (!anySuccess) {
            if (this.ignoreVerifyErrors) {
              // Don't throw error if ignoreVerifyErrors is enabled - warnings already collected
              this.events.emitEvent({
                type: 'verification_skipped',
                level: 'warn',
                data: {
                  actionName: actionName,
                  reason: `Verification failed on all configured platforms for network ${network.name}, but continuing due to --ignore-verify-errors`
                }
              })
            } else {
              throw new Error(`Verification failed on all configured platforms for network ${network.name}`)
            }
          }
        } else {
          // Handle specific platform(s) verification
          let anySuccess = false
          for (const platformName of platformsToTry) {
            const platform = this.verificationRegistry.get(platformName)
            if (!platform) {
              throw new Error(`Action "${actionName}": Unsupported verification platform "${platformName}"`)
            }

            try {
              await this.verifyOnSinglePlatform(
                platform,
                contract,
                address,
                constructorArguments,
                network,
                actionName,
                contractName,
                action,
                context,
                hasCustomOutput
              )
              anySuccess = true
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error)
              
              // If ignoreVerifyErrors is enabled, add to warnings
              if (this.ignoreVerifyErrors) {
                this.verificationWarnings.push({
                  actionName: actionName,
                  address,
                  contractName,
                  platform: platform.name,
                  error: errorMessage,
                  networkName: network.name
                })
              }
              
              // Log the error but continue with other platforms if multiple specified
              this.events.emitEvent({
                type: 'verification_failed',
                level: platformsToTry.length > 1 ? 'warn' : 'error',
                data: {
                  actionName: actionName,
                  address,
                  contractName,
                  platform: platform.name,
                  error: errorMessage
                }
              })
              
              // If only one platform specified, re-throw the error unless ignoreVerifyErrors is enabled
              if (platformsToTry.length === 1 && !this.ignoreVerifyErrors) {
                throw error
              }
            }
          }

          if (!anySuccess && platformsToTry.length > 1) {
            if (this.ignoreVerifyErrors) {
              // Don't throw error if ignoreVerifyErrors is enabled - warnings already collected
              this.events.emitEvent({
                type: 'verification_skipped',
                level: 'warn',
                data: {
                  actionName: actionName,
                  reason: `Verification failed on all specified platforms: ${platformsToTry.join(', ')}, but continuing due to --ignore-verify-errors`
                }
              })
            } else {
              throw new Error(`Verification failed on all specified platforms: ${platformsToTry.join(', ')}`)
            }
          }
        }

        break
      }
      case 'static': {
        const resolvedValue = await this.resolver.resolve(action.arguments.value, context, scope)
        
        if (action.name && !hasCustomOutput) {
          context.setOutput(`${action.name}.value`, resolvedValue)
        }
        break
      }
      case 'create-contract': {
        const resolvedData = await this.resolver.resolve(action.arguments.data, context, scope)
        const resolvedValue = action.arguments.value ? await this.resolver.resolve(action.arguments.value, context, scope) : 0
        const resolvedGasMultiplier = action.arguments.gasMultiplier !== undefined ? await this.resolver.resolve(action.arguments.gasMultiplier, context, scope) : undefined
        
        // Validate and convert types
        const data = validateHexData(resolvedData, actionName, 'data')
        const value = validateBigNumberish(resolvedValue, actionName, 'value')
        
        // Validate gas multiplier if provided
        let gasMultiplier: number | undefined
        if (resolvedGasMultiplier !== undefined) {
          if (typeof resolvedGasMultiplier !== 'number' || resolvedGasMultiplier <= 0) {
            throw new Error(`Action "${actionName}": gasMultiplier must be a positive number, got: ${resolvedGasMultiplier}`)
          }
          gasMultiplier = resolvedGasMultiplier
        }
        
        // Prepare transaction parameters for contract creation (to: null)
        const txParams: any = { to: null, data, value }
        
        // Handle gas limit with optional multiplier
        const network = context.getNetwork()
        const signer = await context.getResolvedSigner()
        if (network.gasLimit) {
          const baseGasLimit = network.gasLimit
          txParams.gasLimit = gasMultiplier ? Math.floor(baseGasLimit * gasMultiplier) : baseGasLimit
        } else if (gasMultiplier) {
          // If gasMultiplier is specified but no network gasLimit, estimate gas first
          const estimatedGas = await signer.estimateGas({ to: null, data, value })
          txParams.gasLimit = Math.floor(Number(estimatedGas) * gasMultiplier)
        }

        await this.checkFundsForTransaction(actionName, txParams, context, signer)
        const tx = await signer.sendTransaction(txParams)
        
        this.events.emitEvent({
          type: 'transaction_sent',
          level: 'info',
          data: {
            to: 'contract creation',
            value: value.toString(),
            dataPreview: String(data).substring(0, 42),
            txHash: tx.hash
          }
        })
        
        const receipt = await tx.wait()
        if (!receipt || receipt.status !== 1) {
            throw new Error(`Contract creation for action "${actionName}" failed (reverted). Hash: ${tx.hash}`)
        }
        
        if (!receipt.contractAddress) {
            throw new Error(`Contract creation for action "${actionName}" did not return a contract address. Hash: ${tx.hash}`)
        }
        
        this.events.emitEvent({
          type: 'transaction_confirmed',
          level: 'info',
          data: {
            txHash: tx.hash,
            blockNumber: receipt.blockNumber
          }
        })
        
        this.events.emitEvent({
          type: 'contract_created',
          level: 'info',
          data: {
            contractAddress: receipt.contractAddress,
            txHash: tx.hash,
            blockNumber: receipt.blockNumber
          }
        })
        
        if (action.name && !hasCustomOutput) {
            context.setOutput(`${action.name}.hash`, tx.hash)
            context.setOutput(`${action.name}.receipt`, receipt)
            context.setOutput(`${action.name}.address`, receipt.contractAddress)
        }
        break
      }
      case 'test-nicks-method': {
        if (this.nicksMethodResult !== undefined && !this.allowMultipleNicksMethodTests) {
          if (this.nicksMethodResult === false) {
            throw new Error(`Nick's method test already failed this run`)
          }
          this.events.emitEvent({
            type: 'debug_info',
            level: 'debug',
            data: {
              message: `Nick's method test already passed this run`,
            },
          })
          break
        }

        // Default bytecode if none provided
        const defaultBytecode = '0x608060405234801561001057600080fd5b5061013d806100206000396000f3fe60806040526004361061001e5760003560e01c80639c4ae2d014610023575b600080fd5b6100cb6004803603604081101561003957600080fd5b81019060208101813564010000000081111561005457600080fd5b82018360208201111561006657600080fd5b8035906020019184600183028401116401000000008311171561008857600080fd5b91908080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525092955050913592506100cd915050565b005b60008183516020850134f56040805173ffffffffffffffffffffffffffffffffffffffff83168152905191925081900360200190a050505056fea264697066735822122033609f614f03931b92d88c309d698449bb77efcd517328d341fa4f923c5d8c7964736f6c63430007060033'
        
        // Handle case where arguments is undefined (action takes no arguments)
        const args = action.arguments || {}
        const resolvedBytecode = args.bytecode ? await this.resolver.resolve(args.bytecode, context, scope) : defaultBytecode
        const resolvedGasPrice = args.gasPrice ? await this.resolver.resolve(args.gasPrice, context, scope) : undefined
        const resolvedGasLimit = args.gasLimit ? await this.resolver.resolve(args.gasLimit, context, scope) : undefined
        const resolvedFundingAmount = args.fundingAmount ? await this.resolver.resolve(args.fundingAmount, context, scope) : undefined
        
        // Validate inputs
        const bytecode = validateHexData(resolvedBytecode, actionName, 'bytecode')
        const gasPrice = resolvedGasPrice ? validateBigNumberish(resolvedGasPrice, actionName, 'gasPrice') : undefined
        const gasLimit = resolvedGasLimit ? validateBigNumberish(resolvedGasLimit, actionName, 'gasLimit') : undefined
        const fundingAmount = resolvedFundingAmount ? validateBigNumberish(resolvedFundingAmount, actionName, 'fundingAmount') : undefined
        
        const success = await this.testNicksMethod(bytecode, context, gasPrice, gasLimit, fundingAmount)
        this.nicksMethodResult = success
        
        if (!success) {
          throw new Error(`Nick's method test failed for action "${actionName}"`)
        }
        
        this.events.emitEvent({
          type: 'action_completed',
          level: 'info',
          data: {
            actionName: actionName,
            result: 'Nick\'s method test passed'
          }
        })
        
        if (action.name && !hasCustomOutput) {
          context.setOutput(`${action.name}.success`, true)
        }
        break
      }
      case 'json-request': {
        const resolvedUrl = await this.resolver.resolve(action.arguments.url, context, scope)
        const resolvedMethod = action.arguments.method ? await this.resolver.resolve(action.arguments.method, context, scope) : 'GET'
        const resolvedHeaders = action.arguments.headers ? await this.resolver.resolve(action.arguments.headers, context, scope) : {}
        const resolvedBody = action.arguments.body ? await this.resolver.resolve(action.arguments.body, context, scope) : undefined
        
        // Validate inputs
        if (typeof resolvedUrl !== 'string') {
          throw new Error(`Action "${actionName}": url must be a string, got: ${typeof resolvedUrl}`)
        }
        
        if (typeof resolvedMethod !== 'string') {
          throw new Error(`Action "${actionName}": method must be a string, got: ${typeof resolvedMethod}`)
        }
        
        if (resolvedHeaders && typeof resolvedHeaders !== 'object') {
          throw new Error(`Action "${actionName}": headers must be an object, got: ${typeof resolvedHeaders}`)
        }
        
        try {
          // Prepare fetch options
          const fetchOptions: RequestInit = {
            method: resolvedMethod.toUpperCase(),
            headers: {
              'Content-Type': 'application/json',
              ...(resolvedHeaders as Record<string, string>)
            }
          }
          
          // Add body for non-GET requests
          if (resolvedBody !== undefined && resolvedMethod.toUpperCase() !== 'GET') {
            fetchOptions.body = JSON.stringify(resolvedBody)
          }
          
          this.events.emitEvent({
            type: 'action_started',
            level: 'info',
            data: {
              actionName: actionName,
              message: `Making ${resolvedMethod.toUpperCase()} request to ${resolvedUrl}`
            }
          })
          
          // Make the HTTP request
          const response = await fetch(resolvedUrl, fetchOptions)
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          // Parse JSON response
          const responseData = await response.json()
          
          this.events.emitEvent({
            type: 'action_completed',
            level: 'info',
            data: {
              actionName: actionName,
              message: `Request completed successfully (${response.status})`
            }
          })
          
          // Store outputs
          if (action.name && !hasCustomOutput) {
            context.setOutput(`${action.name}.response`, responseData)
            context.setOutput(`${action.name}.status`, response.status)
            context.setOutput(`${action.name}.statusText`, response.statusText)
          }
        } catch (error) {
          this.events.emitEvent({
            type: 'action_failed',
            level: 'error',
            data: {
              actionName: actionName,
              error: error instanceof Error ? error.message : String(error)
            }
          })
          throw new Error(`Action "${actionName}" failed: ${error instanceof Error ? error.message : String(error)}`)
        }
        break
      }
      default:
        throw new Error(`Unknown or unimplemented primitive action type: ${(action as any).type}`)
    }
  }

  /**
   * Helper method to verify a contract on a single platform
   * @private
   */
  private async verifyOnSinglePlatform(
    platform: any,
    contract: Contract,
    address: string,
    constructorArguments: string | undefined,
    network: any,
    actionName: string,
    contractName: string,
    action: Action,
    context: ExecutionContext,
    hasCustomOutput: boolean = false
  ): Promise<void> {
    // Check if platform supports this network
    const supportsNetwork = platform.supportsNetwork(network)
    if (!supportsNetwork) {
      this.events.emitEvent({
        type: 'action_skipped',
        level: 'info',
        data: {
          actionName: actionName,
          reason: `Network ${network.name} does not support ${platform.name} verification`
        }
      })
      return
    }

    // Check if platform is properly configured
    const isConfigured = platform.isConfigured()
    if (!isConfigured) {
      this.events.emitEvent({
        type: 'action_skipped',
        level: 'warn',
        data: {
          actionName: actionName,
          reason: `Verification skipped: ${platform.getConfigurationRequirements()}`
        }
      })
      return
    }

    // Find and load build info
    let buildInfoPath: string | undefined
    for (const sourcePath of contract._sources) {
      if (sourcePath.includes('/build-info/') && sourcePath.endsWith('.json')) {
        buildInfoPath = sourcePath
        break
      }
    }

    if (!buildInfoPath) {
      throw new Error(`Action "${actionName}": No build-info file found in contract sources`)
    }

    const fs = await import('fs/promises')
    let buildInfoContent: string
    try {
      buildInfoContent = await fs.readFile(buildInfoPath, 'utf-8')
    } catch (error) {
      throw new Error(`Action "${actionName}": Failed to read build info file at ${buildInfoPath}: ${error instanceof Error ? error.message : String(error)}`)
    }

    let buildInfo: BuildInfo
    try {
      buildInfo = JSON.parse(buildInfoContent)
    } catch (error) {
      throw new Error(`Action "${actionName}": Failed to parse build info JSON: ${error instanceof Error ? error.message : String(error)}`)
    }

    this.events.emitEvent({
      type: 'verification_started',
      level: 'info',
      data: {
        actionName: actionName,
        address,
        contractName,
        platform: platform.name,
        networkName: network.name
      }
    })

    try {
      // Use the platform to verify the contract
      const verificationResult = await platform.verifyContract({
        contract,
        buildInfo,
        address,
        constructorArguments,
        network
      })

      if (!verificationResult.success) {
        throw new Error(`Verification failed: ${verificationResult.message}`)
      }

      // Emit appropriate events based on verification result
      if (verificationResult.isAlreadyVerified) {
        this.events.emitEvent({
          type: 'verification_completed',
          level: 'info',
          data: {
            actionName: actionName,
            address,
            contractName,
            platform: platform.name,
            message: verificationResult.message
          }
        })
      } else {
        this.events.emitEvent({
          type: 'verification_submitted',
          level: 'info',
          data: {
            actionName: actionName,
            platform: platform.name,
            guid: verificationResult.guid || 'N/A',
            message: verificationResult.message
          }
        })

        this.events.emitEvent({
          type: 'verification_completed',
          level: 'info',
          data: {
            actionName: actionName,
            address,
            contractName,
            platform: platform.name,
            message: 'Contract verified successfully'
          }
        })
      }

      // Set outputs (only for successful verifications)
      if (action.name && !hasCustomOutput) {
        context.setOutput(`${action.name}.verified`, true)
        if (verificationResult.guid) {
          context.setOutput(`${action.name}.guid`, verificationResult.guid)
        }
      }

    } catch (error) {
      this.events.emitEvent({
        type: 'verification_failed',
        level: 'error',
        data: {
          actionName: actionName,
          address,
          contractName,
          platform: platform.name,
          error: error instanceof Error ? error.message : String(error)
        }
      })
      throw error
    }
  }

  /**
   * Tests Nick's method for EOA deployment
   * Generates a valid ECDSA signature and tests if it can deploy the given bytecode
   * Returns any remaining funds to the original wallet after testing
   */
  private async testNicksMethod(
    bytecode: string,
    context: ExecutionContext,
    gasPrice?: ethers.BigNumberish,
    gasLimit?: ethers.BigNumberish,
    fundingAmount?: ethers.BigNumberish
  ): Promise<boolean> {
    let testResult = false
    let eoaAddress: string | undefined
    let wallet: ethers.HDNodeWallet | ethers.Wallet | undefined
    
    try {
      // Default values
      const defaultGasPrice = gasPrice || ethers.parseUnits('100', 'gwei') // 100 gwei
      const defaultGasLimit = gasLimit || 250000n // Reasonable gas limit for deployment
      const calculatedCost = BigInt(defaultGasPrice.toString()) * BigInt(defaultGasLimit.toString())
      const defaultFundingAmount = fundingAmount || calculatedCost
      
      // Check main signer balance first
      const signer = await context.getResolvedSigner()
      const signerAddress = await signer.getAddress()
      const signerBalance = await context.provider.getBalance(signerAddress)
      
      if (signerBalance < BigInt(defaultFundingAmount.toString())) {
        this.events.emitEvent({
          type: 'action_failed',
          level: 'error',
          data: {
            message: `Insufficient funds: signer has ${ethers.formatEther(signerBalance)} ETH but needs ${ethers.formatEther(defaultFundingAmount)} ETH`
          }
        })
        return false
      }
      
      // Generate a valid ECDSA signature using Nick's method approach
      const result = await this.generateNicksMethodTransaction(bytecode, defaultGasPrice, defaultGasLimit)
      const {signedTx, unsignedTx} = result
      eoaAddress = result.eoaAddress
      wallet = result.wallet

      // Simulate the contract creation transaction
      try {
        const simulationTx = {
          ...unsignedTx,
          from: eoaAddress,
        };

        if (unsignedTx.gasPrice) {
          // Check gas price
          const gasPrice = await context.provider.getFeeData().then(data => data.gasPrice)
          if (!gasPrice) {
            this.events.emitEvent({
              type: "debug_info",
              level: "debug",
              data: {
                message: `Legacy gas price not available.`,
              },
            });
          } else if (BigInt(unsignedTx.gasPrice.toString()) < gasPrice) {
            this.events.emitEvent({
              type: "debug_info",
              level: "warn",
              data: {
                message: `Gas price (${unsignedTx.gasPrice}) is lower than the current gas price (${gasPrice}). This may cause the transaction to not be mined.`,
              },
            });
          }
        }

        if (simulationTx.gasLimit) {
          // Simulate the transaction expected gas usage
          const estimatedGas = await context.provider.estimateGas(simulationTx);
          const estimatedGasStr = estimatedGas.toString();
          const simulationTxGasLimitStr = simulationTx.gasLimit.toString();
          if (estimatedGas > BigInt(simulationTxGasLimitStr)) {
            this.events.emitEvent({
              type: "debug_info",
              level: "warn",
              data: {
                message: `Estimated gas (${estimatedGasStr}) is greater than gas provided in the transaction (${simulationTxGasLimitStr}). This may cause the transaction to revert.`,
              },
            });
          } else {
            this.events.emitEvent({
              type: "debug_info",
              level: "debug",
              data: {
                message: `Estimated gas: ${estimatedGasStr}, Gas provided: ${simulationTxGasLimitStr}`,
              },
            });
          }
        }
      } catch (simulationError) {
        this.events.emitEvent({
          type: "debug_info",
          level: "warn",
          data: {
            message: `Simulation failed: ${
              simulationError instanceof Error
                ? simulationError.message
                : String(simulationError)
            }`,
          },
        });
        // Continue with the test even if simulation fails
      }
      
      this.events.emitEvent({
        type: 'debug_info',
        level: 'debug',
        data: {
          message: `Testing Nick's method with EOA: ${eoaAddress}`
        }
      })
      
      // Check if EOA already has sufficient balance
      const currentBalance = await context.provider.getBalance(eoaAddress)
      const neededFunding = BigInt(defaultFundingAmount.toString()) - currentBalance
      
      if (neededFunding > 0) {
        // Fund the EOA
        this.events.emitEvent({
          type: 'transaction_sent',
          level: 'debug',
          data: {
            to: eoaAddress,
            value: neededFunding.toString(),
            dataPreview: 'funding EOA for Nick\'s method test',
            txHash: 'pending'
          }
        })
        
        this.events.emitEvent({
          type: 'debug_info',
          level: 'debug',
          data: {
            message: `[NICK'S METHOD DEBUG] Sending funding transaction: ${ethers.formatEther(neededFunding)} ETH to ${eoaAddress}`
          }
        })
        
        const signer = await context.getResolvedSigner()
        const fundingTx = await signer.sendTransaction({
          to: eoaAddress,
          value: neededFunding
        })
        
        this.events.emitEvent({
          type: 'debug_info',
          level: 'debug',
          data: {
            message: `[NICK'S METHOD DEBUG] Funding transaction sent: ${fundingTx.hash}, waiting for confirmation...`
          }
        })
        
        const fundingReceipt = await fundingTx.wait()
        
        this.events.emitEvent({
          type: 'transaction_confirmed',
          level: 'debug',
          data: {
            txHash: fundingTx.hash,
            blockNumber: fundingReceipt?.blockNumber || 0
          }
        })
        
        this.events.emitEvent({
          type: 'debug_info',
          level: 'debug',
          data: {
            message: `[NICK'S METHOD DEBUG] Funded EOA ${eoaAddress} with ${ethers.formatEther(neededFunding)} ETH, receipt status: ${fundingReceipt?.status}`
          }
        })
        
        if (!fundingReceipt || fundingReceipt.status !== 1) {
          this.events.emitEvent({
            type: 'action_failed',
            level: 'error',
            data: {
              message: `[NICK'S METHOD DEBUG] Funding transaction failed! Hash: ${fundingTx.hash}, Status: ${fundingReceipt?.status}`
            }
          })
          return false
        }
      } else {
        this.events.emitEvent({
          type: 'debug_info',
          level: 'debug',
          data: {
            message: `[NICK'S METHOD DEBUG] EOA already has sufficient balance, skipping funding`
          }
        })
      }
      
      // Try to broadcast the raw transaction
      this.events.emitEvent({
        type: 'debug_info',
        level: 'debug',
        data: {
          message: `[NICK'S METHOD DEBUG] Broadcasting Nick's method transaction. RawTx: ${signedTx.substring(0, 100)}...`
        }
      })
      
      const deployTx = await context.provider.broadcastTransaction(signedTx)
      
      this.events.emitEvent({
        type: 'debug_info',
        level: 'debug',
        data: {
          message: `[NICK'S METHOD DEBUG] Transaction broadcasted successfully. Hash: ${deployTx.hash}, waiting for confirmation...`
        }
      })
      
      const receipt = await deployTx.wait()
      
      this.events.emitEvent({
        type: 'debug_info',
        level: 'debug',
        data: {
          message: `[NICK'S METHOD DEBUG] Transaction receipt received. Status: ${receipt?.status}, ContractAddress: ${receipt?.contractAddress}, BlockNumber: ${receipt?.blockNumber}`
        }
      })
      
      if (receipt && receipt.status === 1) {
        this.events.emitEvent({
          type: 'transaction_confirmed',
          level: 'info',
          data: {
            txHash: deployTx.hash,
            blockNumber: receipt.blockNumber || 0
          }
        })
        
        this.events.emitEvent({
          type: 'debug_info',
          level: 'debug',
          data: {
            message: `[NICK'S METHOD DEBUG] Nick's method test successful - contract deployed at ${receipt.contractAddress}`
          }
        })
        testResult = true
      } else {
        this.events.emitEvent({
          type: 'action_failed',
          level: 'error',
          data: {
            message: `[NICK'S METHOD DEBUG] Nick's method test failed - transaction reverted or failed. Hash: ${deployTx.hash}, Status: ${receipt?.status}`
          }
        })
        testResult = false
      }
    } catch (error) {
      this.events.emitEvent({
        type: 'action_failed',
        level: 'error',
        data: {
          message: `[NICK'S METHOD DEBUG] Nick's method test failed with error: ${error instanceof Error ? error.message : String(error)}`
        }
      })
      
      // Log additional error details for debugging
      if (error instanceof Error && error.stack) {
        this.events.emitEvent({
          type: 'action_failed',
          level: 'debug',
          data: {
            message: `[NICK'S METHOD DEBUG] Error stack trace: ${error.stack}`
          }
        })
      }
      
      testResult = false
    } finally {
      // Always try to return remaining funds to the original wallet
      if (eoaAddress && wallet) {
        try {
          await this.returnRemainingFunds(eoaAddress, wallet, context)
        } catch (error) {
          // Log the error but don't fail the main test
          this.events.emitEvent({
            type: 'action_failed',
            level: 'warn',
            data: {
              message: `Failed to return remaining funds from EOA ${eoaAddress}: ${error instanceof Error ? error.message : String(error)}`
            }
          })
        }
      }
    }
    
    return testResult
  }

  /**
   * Generates a raw transaction and EOA address using Nick's method approach
   */
  private async generateNicksMethodTransaction(
    bytecode: string,
    gasPrice: ethers.BigNumberish,
    gasLimit: ethers.BigNumberish
  ): Promise<{ unsignedTx: ethers.TransactionRequest; signedTx: string; eoaAddress: string; wallet: ethers.HDNodeWallet }> {
    // Generate a random private key for the test
    const wallet = ethers.Wallet.createRandom()
    
    // Create unsigned transaction
    const unsignedTx: ethers.TransactionRequest = {
      type: 0, // Legacy transaction
      chainId: 0, // Nick's method uses chainId 0
      nonce: 0,
      gasPrice: gasPrice,
      gasLimit: gasLimit,
      to: null, // Contract creation
      value: 0,
      data: bytecode
    }
    
    // Sign the transaction
    const signedTx = await wallet.signTransaction(unsignedTx)
    
    // Parse the signed transaction to get the EOA address
    const parsedTx = ethers.Transaction.from(signedTx)
    const eoaAddress = parsedTx.from!
    
    return {
      unsignedTx,
      signedTx,
      eoaAddress,
      wallet,
    }
  }

  /**
   * Returns any remaining funds from the test EOA back to the original wallet
   */
  private async returnRemainingFunds(
    eoaAddress: string,
    wallet: ethers.HDNodeWallet | ethers.Wallet,
    context: ExecutionContext
  ): Promise<void> {
    // Check remaining balance in the test EOA
    const remainingBalance = await context.provider.getBalance(eoaAddress)
    
    if (remainingBalance <= 0n) {
      // No funds to return
      return
    }
    
    // Connect the wallet to the provider to send transactions
    const connectedWallet = wallet.connect(context.provider)
    
    // Estimate gas for a simple transfer
    const feeData = await context.provider.getFeeData()
    const txGas = feeData.maxFeePerGas ? {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('20', 'gwei')
    } : {
      gasPrice: feeData.gasPrice || undefined,
    }
    const effectiveGasPrice = txGas.maxFeePerGas || txGas.gasPrice
    if (!effectiveGasPrice) {
      this.events.emitEvent({
        type: 'action_failed',
        level: 'error',
        data: {
          message: `No gas price available`
        }
      })
      return
    }
    const gasLimit = 21000n // Standard gas limit for ETH transfer
    const gasCost = effectiveGasPrice * gasLimit
    
    // Check if we have enough balance to cover gas costs
    if (remainingBalance <= gasCost) {
      this.events.emitEvent({
        type: 'action_info',
        level: 'debug',
        data: {
          message: `Remaining balance ${ethers.formatEther(remainingBalance)} ETH is insufficient to cover gas costs for fund return`
        }
      })
      return
    }
    
    // Calculate amount to send (balance minus gas costs)
    const amountToSend = remainingBalance - gasCost
    
    this.events.emitEvent({
      type: 'transaction_sent',
      level: 'debug',
      data: {
        to: await (await context.getResolvedSigner()).getAddress(),
        value: amountToSend.toString(),
        dataPreview: 'returning remaining funds from Nick\'s method test',
        txHash: 'pending'
      }
    })
    
    // Send the remaining funds back to the original signer
    const returnTx = await connectedWallet.sendTransaction({
      to: await (await context.getResolvedSigner()).getAddress(),
      value: amountToSend,
      gasLimit: gasLimit,
      ...txGas,
    })
    
    await returnTx.wait()
    
    this.events.emitEvent({
      type: 'transaction_confirmed',
      level: 'debug',
      data: {
        txHash: returnTx.hash,
        blockNumber: (await returnTx.wait())?.blockNumber || 0
      }
    })
    
    this.events.emitEvent({
      type: 'debug_info',
      level: 'debug',
      data: {
        message: `Returned ${ethers.formatEther(amountToSend)} ETH from test EOA ${eoaAddress} to original wallet`
      }
    })
  }

  /**
   * Retries a boolean-producing async check to mitigate transient RPC state lag after transactions.
   * Returns true on first successful check; otherwise waits delayMs and retries up to retries times.
   */
  private async retryBooleanCheck(checkFn: () => Promise<boolean>, retries: number = 3, delayMs: number = 2000): Promise<boolean> {
    // Throttle debug logging: log first, 25%, 50%, 75%, and final attempt
    const milestones = new Set<number>()
    const total = retries + 1
    milestones.add(1)
    milestones.add(Math.max(1, Math.floor(total * 0.25)))
    milestones.add(Math.max(1, Math.floor(total * 0.5)))
    milestones.add(Math.max(1, Math.floor(total * 0.75)))
    milestones.add(total)

    for (let attempt = 0; attempt < total; attempt++) {
      try {
        const result = await checkFn()
        if (result) {
          return true
        }
        if (milestones.has(attempt + 1)) {
          this.events.emitEvent({
            type: 'debug_info',
            level: 'debug',
            data: {
              message: `Post-execution check returned false (attempt ${attempt + 1}/${total}).`
            }
          })
        }
      } catch (err) {
        if (milestones.has(attempt + 1)) {
          this.events.emitEvent({
            type: 'debug_info',
            level: 'debug',
            data: {
              message: `Post-execution check threw error (attempt ${attempt + 1}/${total}): ${err instanceof Error ? err.message : String(err)}`
            }
          })
        }
      }
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, delayMs))
      }
    }
    return false
  }

  /**
   * Evaluates a list of conditions and returns true if any of them are met.
   */
  private async evaluateSkipConditions(
    conditions: Condition[] | undefined,
    context: ExecutionContext,
    scope: ResolutionScope,
  ): Promise<boolean> {
    if (!conditions || conditions.length === 0) {
      return false
    }
    for (const condition of conditions) {
      const shouldSkip = await this.resolver.resolve(condition, context, scope)
      if (shouldSkip) {
        return true
      }
    }
    return false
  }

  /**
   * Creates a topological sort of actions within a job based on their `depends_on` fields.
   */
  private topologicalSortActions(job: Job): string[] {
    const sorted: string[] = []
    const graph = new Map<string, Set<string>>()
    const inDegree = new Map<string, number>()
    const actionMap = new Map(job.actions.map(a => [a.name, a]))

    // Initialize graph and in-degrees
    for (const action of job.actions) {
      graph.set(action.name, new Set(action.depends_on || []))
      inDegree.set(action.name, 0)
    }

    // Calculate in-degrees and validate dependencies
    for (const [actionName, dependencies] of graph.entries()) {
      for (const depName of dependencies) {
        if (!actionMap.has(depName)) {
          throw new Error(`Action "${actionName}" in job "${job.name}" has an invalid dependency on "${depName}", which does not exist.`)
        }
        inDegree.set(actionName, (inDegree.get(actionName) ?? 0) + 1)
      }
    }

    // Initialize queue with actions having an in-degree of 0
    const queue = Array.from(inDegree.entries())
      .filter(([, degree]) => degree === 0)
      .map(([name]) => name)
    
    // Process the queue
    while (queue.length > 0) {
      const currentName = queue.shift()!
      sorted.push(currentName)

      // Find all actions that depend on the current one
      for (const [actionName, dependencies] of graph.entries()) {
        if (dependencies.has(currentName)) {
          const newDegree = (inDegree.get(actionName) ?? 1) - 1
          inDegree.set(actionName, newDegree)
          if (newDegree === 0) {
            queue.push(actionName)
          }
        }
      }
    }

    if (sorted.length !== job.actions.length) {
      throw new Error(`Circular dependency detected among actions in job "${job.name}".`)
    }

    return sorted
  }

  /**
   * Checks if the signer has enough funds to cover the estimated cost of the transaction.
   * Returns true if the signer has enough funds, false if the signer does not have enough funds, and null if no gas price is available.
   */
  private async checkFundsForTransaction(actionName: string, txParams: ethers.TransactionRequest, context: ExecutionContext, signer: ethers.Signer): Promise<boolean | null> {
    try {
      const gasPrice = txParams.gasPrice || await context.provider.getFeeData().then(data => data.gasPrice)
      if (!gasPrice) {
        this.events.emitEvent({
          type: 'debug_info',
          level: 'warn',
          data: {
            actionName: actionName,
            message: `No gas price available`
          }
        })
        return null
      }
      const gasLimit = txParams.gasLimit || await signer.estimateGas(txParams)
      const requiredETH = BigInt(gasLimit) * BigInt(gasPrice)
      const signerBalance = await context.provider.getBalance(await signer.getAddress())
      if (signerBalance < requiredETH) {
        this.events.emitEvent({
        type: 'debug_info',
          level: 'warn',
          data: {
            actionName: actionName,
            message: `Insufficient funds: signer has ${ethers.formatEther(signerBalance)} ETH but estimated cost is ${ethers.formatEther(requiredETH)} ETH`
          }
        })
        return false
      } else {
        return true
      }
    } catch (error) {
      this.events.emitEvent({
        type: 'debug_info',
        level: 'warn',
        data: {
          actionName: actionName,
          message: "Error checking signer balance: " + (error instanceof Error ? error.message : String(error))
        }
      })
    }
    return null
  }

  /**
   * Get all verification warnings that were collected when ignoreVerifyErrors is enabled
   */
  public getVerificationWarnings(): Array<{
    actionName: string
    address: string
    contractName: string
    platform: string
    error: string
    jobName?: string
    networkName?: string
  }> {
    return [...this.verificationWarnings]
  }

  /**
   * Clear verification warnings (useful for testing)
   */
  public clearVerificationWarnings(): void {
    this.verificationWarnings = []
  }
}