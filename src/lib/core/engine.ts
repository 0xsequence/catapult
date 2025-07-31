import { Job, Template, Action, JobAction, isPrimitiveActionType, Condition } from '../types'
import { Contract } from '../types/contracts'
import { ExecutionContext } from './context'
import { ValueResolver, ResolutionScope } from './resolver'
import { validateAddress, validateHexData, validateBigNumberish, validateRawTransaction } from '../utils/validation'
import { DeploymentEventEmitter, deploymentEvents } from '../events'
import { submitVerification, waitForVerification, isContractAlreadyVerified } from '../verification/etherscan'
import { BuildInfo } from '../types/buildinfo'

/**
 * The ExecutionEngine is the core component that runs jobs and their actions.
 * It interprets the declarative YAML files, resolves values, interacts with the
 * blockchain, and manages the overall execution flow.
 */
export class ExecutionEngine {
  private readonly resolver: ValueResolver
  private readonly templates: Map<string, Template>
  private readonly events: DeploymentEventEmitter

  constructor(templates: Map<string, Template>, eventEmitter?: DeploymentEventEmitter) {
    this.resolver = new ValueResolver()
    this.templates = templates
    this.events = eventEmitter || deploymentEvents
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
    
    this.events.emitEvent({
      type: 'action_started',
      level: 'info',
      data: {
        actionName: actionName,
        jobName: 'unknown' // We'll need to pass job context later
      }
    })

    // 1. Evaluate skip conditions for the action itself.
    if (await this.evaluateSkipConditions(action.skip_condition, context, scope)) {
      this.events.emitEvent({
        type: 'action_skipped',
        level: 'info',
        data: {
          actionName: actionName,
          reason: 'condition met'
        }
      })
      return
    }

    // 2. Differentiate between a primitive action and a template call.
    if (isPrimitiveActionType(templateName)) {
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
      await this.executePrimitive(primitiveAction, context, scope)
    } else {
      await this.executeTemplate(action, templateName, context)
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
        // Resolve the argument value in the parent's context before passing it down.
        const resolvedValue = await this.resolver.resolve(value, context, new Map())
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
    if (await this.evaluateSkipConditions(templateSkipConditions, context, templateScope)) {
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

    // 5. Resolve and store the template's outputs into the global context.
    if (template.outputs && 'name' in callingAction) {
      for (const [key, value] of Object.entries(template.outputs)) {
        const resolvedOutput = await this.resolver.resolve(value, context, templateScope)
        const outputKey = `${callingAction.name}.${key}`
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
   */
  private async executePrimitive(
    action: Action,
    context: ExecutionContext,
    scope: ResolutionScope,
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
        
        // Validate and convert types
        const to = validateAddress(resolvedTo, actionName)
        const data = validateHexData(resolvedData, actionName, 'data')
        const value = validateBigNumberish(resolvedValue, actionName, 'value')
        
        const tx = await context.signer.sendTransaction({ to, data, value })
        
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
        
        if (action.name) {
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
        
        if (action.name) {
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
          : 'etherscan_v2'

        // Validate inputs
        const address = validateAddress(resolvedAddress, actionName)
        
        if (!resolvedContract || typeof resolvedContract !== 'object') {
          throw new Error(`Action "${actionName}": contract must be a Contract object`)
        }

        const contract = resolvedContract as Contract

        if (typeof resolvedPlatform !== 'string') {
          throw new Error(`Action "${actionName}": platform must be a string`)
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

        // Check if network supports verification
        const network = context.getNetwork()
        if (network.supports && !network.supports.includes(resolvedPlatform)) {
          this.events.emitEvent({
            type: 'action_skipped',
            level: 'info',
            data: {
              actionName: actionName,
              reason: `Network ${network.name} does not support ${resolvedPlatform} verification`
            }
          })
          return
        }

        // Check if API key is available
        const etherscanApiKey = context.getEtherscanApiKey()
        if (!etherscanApiKey) {
          this.events.emitEvent({
            type: 'action_skipped',
            level: 'warn',
            data: {
              actionName: actionName,
              reason: 'Verification skipped because Etherscan API key is not provided. Set --etherscan-api-key or ETHERSCAN_API_KEY environment variable.'
            }
          })
          return
        }

        if (resolvedPlatform !== 'etherscan_v2') {
          throw new Error(`Action "${actionName}": Unsupported verification platform "${resolvedPlatform}". Currently only "etherscan_v2" is supported.`)
        }

        // Find the build-info file from the contract's sources
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

        // Load the actual build info file
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

        const contractName = `${contract.sourceName}:${contract.contractName}`

        this.events.emitEvent({
          type: 'verification_started',
          level: 'info',
          data: {
            actionName: actionName,
            address,
            contractName,
            platform: resolvedPlatform,
            networkName: network.name
          }
        })

        try {
          // First check if the contract is already verified
          const alreadyVerified = await isContractAlreadyVerified(address, etherscanApiKey, network)
          
          if (alreadyVerified) {
            // Contract is already verified, skip verification attempt
            this.events.emitEvent({
              type: 'verification_completed',
              level: 'info',
              data: {
                actionName: actionName,
                address,
                contractName,
                message: 'Contract was already verified (checked before attempting verification)'
              }
            })

            if (action.name) {
              context.setOutput(`${action.name}.verified`, true)
            }
            return
          }

          // Submit verification
          const verificationResult = await submitVerification({
            contract,
            buildInfo,
            address,
            constructorArguments,
            apiKey: etherscanApiKey,
            network
          })

          if (!verificationResult.success) {
            throw new Error(`Verification submission failed: ${verificationResult.message}`)
          }

          this.events.emitEvent({
            type: 'verification_submitted',
            level: 'info',
            data: {
              actionName: actionName,
              guid: verificationResult.guid || 'N/A',
              message: verificationResult.message
            }
          })

          // If we have a guid, wait for verification to complete
          // If no guid (contract already verified), skip waiting and mark as successful
          if (verificationResult.guid) {
            const verificationStatus = await waitForVerification(verificationResult.guid, etherscanApiKey, network)

            if (verificationStatus.isSuccess) {
              this.events.emitEvent({
                type: 'verification_completed',
                level: 'info',
                data: {
                  actionName: actionName,
                  address,
                  contractName,
                  message: 'Contract verified successfully'
                }
              })

              if (action.name) {
                context.setOutput(`${action.name}.verified`, true)
                context.setOutput(`${action.name}.guid`, verificationResult.guid)
              }
            } else {
              throw new Error(`Verification failed: ${verificationStatus.message}`)
            }
          } else {
            // Contract was already verified, mark as completed
            this.events.emitEvent({
              type: 'verification_completed',
              level: 'info',
              data: {
                actionName: actionName,
                address,
                contractName,
                message: 'Contract was already verified'
              }
            })

            if (action.name) {
              context.setOutput(`${action.name}.verified`, true)
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
              error: error instanceof Error ? error.message : String(error)
            }
          })
          throw error
        }

        break
      }
      default:
        throw new Error(`Unknown or unimplemented primitive action type: ${(action as any).type}`)
    }
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
}