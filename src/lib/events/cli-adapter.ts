import chalk from 'chalk'
import { DeploymentEvent } from './types'
import { DeploymentEventEmitter } from './emitter'

/**
 * Verbosity levels for filtering console output:
 * 0 (default): Critical info only - errors, warnings, main deployment steps
 * 1 (-v): Add transaction details and verification steps  
 * 2 (-vv): Add action details and file operations
 * 3 (-vvv): Full debug - show everything including template transitions
 */
export type VerbosityLevel = 0 | 1 | 2 | 3

/**
 * CLI adapter that converts structured deployment events into
 * formatted console output using chalk for colors.
 */
export class CLIEventAdapter {
  private emitter: DeploymentEventEmitter
  private verbosity: VerbosityLevel

  constructor(emitter: DeploymentEventEmitter, verbosity: VerbosityLevel = 0) {
    this.emitter = emitter
    this.verbosity = verbosity
    this.setupListeners()
  }

  /**
   * Updates the verbosity level for this adapter.
   */
  setVerbosity(verbosity: VerbosityLevel): void {
    this.verbosity = verbosity
  }



  private setupListeners(): void {
    this.emitter.onAnyEvent((event) => {
      this.handleEvent(event)
    })
  }

  /**
   * Determines the minimum verbosity level required to show an event.
   */
  private getEventVerbosityLevel(eventType: string): VerbosityLevel {
    // Level 0 (default): Critical info only
    const level0Events = new Set([
      'deployment_started', 'deployment_completed', 'deployment_failed',
      'job_started', 'job_completed', 'job_skipped', 'job_execution_failed',
      'network_started',
      'duplicate_artifact_warning', 'missing_network_config_warning',
      'unhandled_rejection', 'uncaught_exception', 'cli_error',
      'verification_failed'
    ])

    // Level 1 (-v): Add transaction details and verification
    const level1Events = new Set([
      'project_loading_started', 'project_loaded', 'execution_plan',
      'transaction_sent', 'transaction_confirmed',
      'verification_started', 'verification_submitted', 'verification_completed',
      'output_writing_started', 'output_file_written', 'no_outputs'
    ])

    // Level 2 (-vv): Add action details and operations
    const level2Events = new Set([
      'action_started', 'action_skipped',
      'template_setup_started', 'template_setup_completed', 'template_setup_skipped', 'template_skipped'
    ])

    // Level 3 (-vvv): Full debug - everything else
    const level3Events = new Set([
      'template_entered', 'template_exited',
      'primitive_action', 'output_stored',
      'debug_info', 'action_failed', 'action_info', 'action_completed'
    ])

    if (level0Events.has(eventType)) return 0
    if (level1Events.has(eventType)) return 1
    if (level2Events.has(eventType)) return 2
    if (level3Events.has(eventType)) return 3
    
    // Default to level 3 for any new events we haven't categorized
    return 3
  }

  private handleEvent(event: DeploymentEvent): void {
    // Filter events based on verbosity level
    const requiredLevel = this.getEventVerbosityLevel(event.type)
    if (this.verbosity < requiredLevel) {
      return
    }
    switch (event.type) {
      case 'deployment_started':
        console.log(chalk.bold.inverse(' CATAPULT: STARTING DEPLOYMENT RUN '))
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
        console.log(chalk.yellow(`    ↪ Skipping "${event.data.actionName}": ${event.data.reason}`))
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

      case 'template_setup_skipped':
        // Don't output anything - this is internal and not user-facing
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
        console.log(chalk.bold.inverse('\n CATAPULT: DEPLOYMENT RUN COMPLETED SUCCESSFULLY '))
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
        console.error(chalk.red('Unhandled Rejection:'), event.data.error, chalk.red('origin:'), event.data.origin)
        break

      case 'uncaught_exception':
        console.error(chalk.red('Uncaught Exception:'), event.data.error)
        break

      case 'cli_error':
        console.error(chalk.red('Error:'), event.data.message)
        break

      case 'verification_started':
        console.log(chalk.gray(`        🔍 Verifying contract on ${event.data.platform} (${event.data.networkName})...`))
        break

      case 'verification_submitted':
        if (event.data.guid && event.data.guid !== 'N/A') {
          console.log(chalk.gray(`        📝 Verification submitted to ${event.data.platform} (GUID: ${event.data.guid})`))
        }
        break

      case 'verification_completed':
        if (event.data.message.includes('already verified')) {
          console.log(chalk.yellow(`        ✓ Already verified on ${event.data.platform}`))
        } else {
          console.log(chalk.green(`        ✅ ${event.data.message} on ${event.data.platform}`))
        }
        break

      case 'verification_failed':
        console.log(chalk.red(`        ❌ Verification failed on ${event.data.platform}: ${event.data.error}`))
        break

      case 'verification_retry':
        console.log(`Verification attempt ${event.data.attempt} failed with "contract not found" error`)
        break

      case 'job_execution_failed':
        console.error(chalk.red.bold(`❌ Job "${event.data.jobName}" failed on ${event.data.networkName} (Chain ID: ${event.data.chainId})`))
        console.error(chalk.red(`   Error: ${event.data.error}`))
        break

      case 'action_completed':
        console.log(chalk.green(`      ✅ ${event.data.result}`))
        break

      case 'action_failed':
        console.log(chalk.red(`      ❌ ${event.data.message}`))
        break

      case 'action_info':
        console.log(chalk.gray(`      ℹ️  ${event.data.message}`))
        break

      case 'debug_info':
        console.log(chalk.gray(`        [DEBUG] ${event.data.message}`))
        break

      default:
        // Suppress raw debug dumps in CLI output; only show a concise line at highest verbosity
        if (this.verbosity >= 3) {
          const level = (event as any).level?.toUpperCase?.() || 'DEBUG'
          const type = (event as any).type || 'event'
          const msg = (event as any).data?.message
          if (msg) {
            console.log(chalk.gray(`        [${level}] ${type}: ${msg}`))
          }
          // Otherwise, remain silent to avoid noisy/broken logs
        }
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