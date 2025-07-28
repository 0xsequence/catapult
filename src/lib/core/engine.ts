import chalk from 'chalk'
import { Job, Template, Action, JobAction, isPrimitiveActionType, Condition } from '../types'
import { ExecutionContext } from './context'
import { ValueResolver, ResolutionScope } from './resolver'
import { validateAddress, validateHexData, validateBigNumberish, validateRawTransaction } from '../utils/validation'

/**
 * The ExecutionEngine is the core component that runs jobs and their actions.
 * It interprets the declarative YAML files, resolves values, interacts with the
 * blockchain, and manages the overall execution flow.
 */
export class ExecutionEngine {
  private readonly resolver: ValueResolver
  private readonly templates: Map<string, Template>

  constructor(templates: Map<string, Template>) {
    this.resolver = new ValueResolver()
    this.templates = templates
  }

  /**
   * Executes a single job against a given network context.
   * @param job The Job object to execute.
   * @param context The ExecutionContext for the target network.
   */
  public async executeJob(job: Job, context: ExecutionContext): Promise<void> {
    console.log(chalk.cyan.bold(`\n🚀 Starting job: ${job.name} (v${job.version})`))

    const executionOrder = this.topologicalSortActions(job)

    for (const actionName of executionOrder) {
      const action = job.actions.find(a => a.name === actionName)
      if (!action) {
        // This should be unreachable if topological sort is correct
        throw new Error(`Internal error: Action "${actionName}" not found in job "${job.name}".`)
      }
      await this.executeAction(action, context, new Map())
    }

    console.log(chalk.green.bold(`✅ Job "${job.name}" completed successfully.`))
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
    const templateName = 'template' in action ? action.template : action.type
    
    console.log(chalk.blue(`  - Executing: ${actionName}`))

    // 1. Evaluate skip conditions for the action itself.
    if (await this.evaluateSkipConditions(action.skip_condition, context, scope)) {
      console.log(chalk.yellow(`    ↪ Skipping "${actionName}" due to met condition.`))
      return
    }

    // 2. Differentiate between a primitive action and a template call.
    if (isPrimitiveActionType(templateName)) {
      // Convert JobAction to Action for primitive execution
      const primitiveAction: Action = 'template' in action 
        ? {
            type: action.template as any,
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
    console.log(chalk.magenta(`    -> Entering template: ${template.name}`))

    // 1. Create and populate a new resolution scope for this template call.
    const templateScope: ResolutionScope = new Map()
    if ('arguments' in callingAction) {
      for (const [key, value] of Object.entries(callingAction.arguments)) {
        // Resolve the argument value in the parent's context before passing it down.
        const resolvedValue = await this.resolver.resolve(value, context, new Map())
        templateScope.set(key, resolvedValue)
      }
    }
    
    // 2. Handle template-level setup block.
    if (template.setup?.actions) {
        console.log(chalk.magenta(`    -> Running setup for template: ${template.name}`))
        for (const setupAction of template.setup.actions) {
          // Setup actions are executed with the new template scope.
          await this.executeAction(setupAction, context, templateScope)
        }
        console.log(chalk.magenta(`    <- Finished setup for template: ${template.name}`))
    }

    // 3. Evaluate template-level skip conditions.
    const templateSkipConditions = template.skip_condition || template.setup?.skip_condition
    if (await this.evaluateSkipConditions(templateSkipConditions, context, templateScope)) {
      console.log(chalk.yellow(`    ↪ Skipping actions in template "${template.name}" due to met condition.`))
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
        console.log(chalk.gray(`      Stored output: ${outputKey} = ${resolvedOutput}`))
      }
    }

    console.log(chalk.magenta(`    <- Exiting template: ${template.name}`))
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
    console.log(chalk.gray(`      Executing primitive: ${action.type}`))

    switch (action.type) {
      case 'send-transaction': {
        const resolvedTo = await this.resolver.resolve(action.arguments.to, context, scope)
        const resolvedData = action.arguments.data ? await this.resolver.resolve(action.arguments.data, context, scope) : '0x'
        const resolvedValue = action.arguments.value ? await this.resolver.resolve(action.arguments.value, context, scope) : 0
        
        // Validate and convert types
        const to = validateAddress(resolvedTo, actionName)
        const data = validateHexData(resolvedData, actionName, 'data')
        const value = validateBigNumberish(resolvedValue, actionName, 'value')
        
        console.log(chalk.gray(`        to: ${to}, value: ${value}, data: ${String(data).substring(0, 42)}...`))

        const tx = await context.signer.sendTransaction({ to, data, value })
        console.log(chalk.gray(`        tx hash: ${tx.hash}`))
        
        const receipt = await tx.wait()
        if (!receipt || receipt.status !== 1) {
            throw new Error(`Transaction for action "${actionName}" failed (reverted). Hash: ${tx.hash}`)
        }
        
        console.log(chalk.gray(`        tx confirmed in block: ${receipt.blockNumber}`))
        
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
        console.log(chalk.gray(`        tx hash: ${tx.hash}`))
        
        const receipt = await tx.wait()
        if (!receipt || receipt.status !== 1) {
            throw new Error(`Signed transaction for action "${actionName}" failed (reverted). Hash: ${tx.hash}`)
        }
        
        console.log(chalk.gray(`        tx confirmed in block: ${receipt.blockNumber}`))
        
        if (action.name) {
            context.setOutput(`${action.name}.hash`, tx.hash)
            context.setOutput(`${action.name}.receipt`, receipt)
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