import chalk from 'chalk'
import { DeploymentEvent } from './types'
import { DeploymentEventEmitter } from './emitter'

/**
 * CLI adapter that converts structured deployment events into
 * formatted console output using chalk for colors.
 */
export class CLIEventAdapter {
  private emitter: DeploymentEventEmitter

  constructor(emitter: DeploymentEventEmitter) {
    this.emitter = emitter
    this.setupListeners()
  }

  private setupListeners(): void {
    this.emitter.onAnyEvent((event) => {
      this.handleEvent(event)
    })
  }

  private handleEvent(event: DeploymentEvent): void {
    switch (event.type) {
      case 'deployment_started':
        console.log(chalk.bold.inverse(' DEPLOYITO: STARTING DEPLOYMENT RUN '))
        break

      case 'project_loading_started':
        console.log(chalk.blue(`\n1. Loading project from: ${event.data.projectRoot}`))
        break

      case 'project_loaded':
        console.log(chalk.green(`   - Loaded ${event.data.jobCount} jobs, ${event.data.templateCount} templates, and registered artifacts.`))
        break

      case 'execution_plan':
        console.log(chalk.blue('\n2. Execution Plan'))
        console.log(chalk.gray(`   - Target Networks: ${event.data.targetNetworks.map(n => `${n.name} (ChainID: ${n.chainId})`).join(', ')}`))
        console.log(chalk.gray(`   - Job Execution Order: ${event.data.jobExecutionOrder.join(' -> ')}`))
        break

      case 'network_started':
        console.log(chalk.cyan.bold(`\nNetwork: ${event.data.networkName} (ChainID: ${event.data.chainId})`))
        break

      case 'job_started':
        console.log(chalk.cyan.bold(`\n🚀 Starting job: ${event.data.jobName} (v${event.data.jobVersion})`))
        break

      case 'job_completed':
        console.log(chalk.green.bold(`✅ Job "${event.data.jobName}" completed successfully.`))
        break

      case 'job_skipped':
        console.log(chalk.yellow(`  Skipping job "${event.data.jobName}" on network "${event.data.networkName}" due to configuration.`))
        break

      case 'action_started':
        console.log(chalk.blue(`  - Executing: ${event.data.actionName}`))
        break

      case 'action_skipped':
        console.log(chalk.yellow(`    ↪ Skipping "${event.data.actionName}" due to met condition.`))
        break

      case 'template_entered':
        console.log(chalk.magenta(`    -> Entering template: ${event.data.templateName}`))
        break

      case 'template_exited':
        console.log(chalk.magenta(`    <- Exiting template: ${event.data.templateName}`))
        break

      case 'template_setup_started':
        console.log(chalk.magenta(`    -> Running setup for template: ${event.data.templateName}`))
        break

      case 'template_setup_completed':
        console.log(chalk.magenta(`    <- Finished setup for template: ${event.data.templateName}`))
        break

      case 'template_skipped':
        console.log(chalk.yellow(`    ↪ Skipping actions in template "${event.data.templateName}" due to met condition.`))
        break

      case 'primitive_action':
        console.log(chalk.gray(`      Executing primitive: ${event.data.actionType}`))
        break

      case 'transaction_sent':
        console.log(chalk.gray(`        to: ${event.data.to}, value: ${event.data.value}, data: ${event.data.dataPreview}...`))
        console.log(chalk.gray(`        tx hash: ${event.data.txHash}`))
        break

      case 'transaction_confirmed':
        console.log(chalk.gray(`        tx confirmed in block: ${event.data.blockNumber}`))
        break

      case 'output_stored':
        console.log(chalk.gray(`      Stored output: ${event.data.outputKey} = ${event.data.value}`))
        break

      case 'output_writing_started':
        console.log(chalk.blue('\n4. Writing output files...'))
        break

      case 'output_file_written':
        console.log(chalk.green(`   - Wrote: ${event.data.relativePath}`))
        break

      case 'no_outputs':
        console.log(chalk.yellow('\nNo successful job executions to write to output.'))
        break

      case 'deployment_completed':
        console.log(chalk.bold.inverse('\n DEPLOYITO: DEPLOYMENT RUN COMPLETED SUCCESSFULLY '))
        break

      case 'deployment_failed':
        console.error(chalk.red.bold('\n💥 DEPLOYMENT FAILED!'))
        if (event.data.stack) {
          console.error(chalk.red(event.data.stack))
        } else {
          console.error(chalk.red(event.data.error))
        }
        break

      case 'duplicate_artifact_warning':
        console.warn(`Warning: Duplicate artifact contractName found: "${event.data.contractName}". Name-based lookup disabled - use hash or path references instead.`)
        break

      case 'missing_network_config_warning':
        console.warn(chalk.yellow(`Warning: Could not find network configurations for specified chain IDs: ${event.data.missingChainIds.join(', ')}`))
        break

      case 'unhandled_rejection':
        console.error(chalk.red('Unhandled Rejection at:'), event.data.promise, chalk.red('reason:'), event.data.reason)
        break

      case 'uncaught_exception':
        console.error(chalk.red('Uncaught Exception:'), event.data.error)
        break

      case 'cli_error':
        console.error(chalk.red('Error:'), event.data.message)
        break

      default:
        // For any unhandled event types, provide a generic output
        console.log(`[${(event as any).level?.toUpperCase() || 'UNKNOWN'}] ${(event as any).type || 'UNKNOWN'}:`, event)
        break
    }
  }

  /**
   * Stop listening to events (cleanup method).
   */
  public destroy(): void {
    this.emitter.removeAllListeners()
  }
} 