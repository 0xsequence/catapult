"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLIEventAdapter = void 0;
const chalk_1 = __importDefault(require("chalk"));
class CLIEventAdapter {
    constructor(emitter, verbosity = 0) {
        this.emitter = emitter;
        this.verbosity = verbosity;
        this.setupListeners();
    }
    setVerbosity(verbosity) {
        this.verbosity = verbosity;
    }
    setupListeners() {
        this.emitter.onAnyEvent((event) => {
            this.handleEvent(event);
        });
    }
    getEventVerbosityLevel(eventType) {
        const level0Events = new Set([
            'deployment_started', 'deployment_completed', 'deployment_failed',
            'job_started', 'job_completed', 'job_skipped', 'job_execution_failed',
            'network_started', 'network_signer_info',
            'duplicate_artifact_warning', 'missing_network_config_warning',
            'unhandled_rejection', 'uncaught_exception', 'cli_error',
            'verification_failed'
        ]);
        const level1Events = new Set([
            'project_loading_started', 'project_loaded', 'execution_plan',
            'transaction_sent', 'transaction_confirmed',
            'contract_created',
            'verification_started', 'verification_submitted', 'verification_completed',
            'output_writing_started', 'output_file_written', 'no_outputs',
            'run_summary'
        ]);
        const level2Events = new Set([
            'action_started', 'action_skipped',
            'template_setup_started', 'template_setup_completed', 'template_setup_skipped', 'template_skipped'
        ]);
        const level3Events = new Set([
            'template_entered', 'template_exited',
            'primitive_action', 'output_stored',
            'debug_info', 'action_failed', 'action_info', 'action_completed'
        ]);
        if (level0Events.has(eventType))
            return 0;
        if (level1Events.has(eventType))
            return 1;
        if (level2Events.has(eventType))
            return 2;
        if (level3Events.has(eventType))
            return 3;
        return 3;
    }
    handleEvent(event) {
        const requiredLevel = this.getEventVerbosityLevel(event.type);
        if (this.verbosity < requiredLevel) {
            return;
        }
        switch (event.type) {
            case 'deployment_started':
                console.log(chalk_1.default.bold.inverse(' CATAPULT: STARTING DEPLOYMENT RUN '));
                break;
            case 'project_loading_started':
                console.log(chalk_1.default.blue(`\n1. Loading project from: ${event.data.projectRoot}`));
                break;
            case 'project_loaded':
                console.log(chalk_1.default.green(`   - Loaded ${event.data.jobCount} jobs, ${event.data.templateCount} templates, and registered artifacts.`));
                break;
            case 'execution_plan':
                console.log(chalk_1.default.blue('\n2. Execution Plan'));
                console.log(chalk_1.default.gray(`   - Target Networks: ${event.data.targetNetworks.map(n => `${n.name} (ChainID: ${n.chainId})`).join(', ')}`));
                console.log(chalk_1.default.gray(`   - Job Execution Order: ${event.data.jobExecutionOrder.join(' -> ')}`));
                break;
            case 'network_started':
                console.log(chalk_1.default.cyan.bold(`\nNetwork: ${event.data.networkName} (ChainID: ${event.data.chainId})`));
                break;
            case 'network_signer_info':
                console.log(chalk_1.default.gray(`        Sender: ${event.data.address}`));
                console.log(chalk_1.default.gray(`        Balance: ${event.data.balance} ETH (${event.data.balanceWei} wei)`));
                break;
            case 'job_started':
                console.log(chalk_1.default.cyan.bold(`\n🚀 Starting job: ${event.data.jobName} (v${event.data.jobVersion})`));
                break;
            case 'job_completed':
                console.log(chalk_1.default.green.bold(`✅ Job "${event.data.jobName}" completed successfully.`));
                break;
            case 'job_skipped':
                console.log(chalk_1.default.yellow(`  Skipping job "${event.data.jobName}" on network "${event.data.networkName}" due to configuration.`));
                break;
            case 'action_started':
                console.log(chalk_1.default.blue(`  - Executing: ${event.data.actionName}`));
                break;
            case 'action_skipped':
                console.log(chalk_1.default.yellow(`    ↪ Skipping "${event.data.actionName}": ${event.data.reason}`));
                break;
            case 'template_entered':
                console.log(chalk_1.default.magenta(`    -> Entering template: ${event.data.templateName}`));
                break;
            case 'template_exited':
                console.log(chalk_1.default.magenta(`    <- Exiting template: ${event.data.templateName}`));
                break;
            case 'template_setup_started':
                console.log(chalk_1.default.magenta(`    -> Running setup for template: ${event.data.templateName}`));
                break;
            case 'template_setup_completed':
                console.log(chalk_1.default.magenta(`    <- Finished setup for template: ${event.data.templateName}`));
                break;
            case 'template_setup_skipped':
                break;
            case 'template_skipped':
                console.log(chalk_1.default.yellow(`    ↪ Skipping actions in template "${event.data.templateName}" due to met condition.`));
                break;
            case 'primitive_action':
                console.log(chalk_1.default.gray(`      Executing primitive: ${event.data.actionType}`));
                break;
            case 'transaction_sent':
                console.log(chalk_1.default.gray(`        to: ${event.data.to}, value: ${event.data.value}, data: ${event.data.dataPreview}...`));
                console.log(chalk_1.default.gray(`        tx hash: ${event.data.txHash}`));
                break;
            case 'transaction_confirmed':
                console.log(chalk_1.default.gray(`        tx confirmed in block: ${event.data.blockNumber}`));
                break;
            case 'output_stored':
                console.log(chalk_1.default.gray(`      Stored output: ${event.data.outputKey} = ${event.data.value}`));
                break;
            case 'output_writing_started':
                console.log(chalk_1.default.blue('\n4. Writing output files...'));
                break;
            case 'output_file_written':
                console.log(chalk_1.default.green(`   - Wrote: ${event.data.relativePath}`));
                break;
            case 'no_outputs':
                console.log(chalk_1.default.yellow('\nNo successful job executions to write to output.'));
                break;
            case 'deployment_completed':
                console.log(chalk_1.default.bold.inverse('\n CATAPULT: DEPLOYMENT RUN COMPLETED SUCCESSFULLY '));
                break;
            case 'deployment_failed':
                console.error(chalk_1.default.red.bold('\n💥 DEPLOYMENT FAILED!'));
                const failedJobs = event.data?.failedJobs;
                if (Array.isArray(failedJobs) && failedJobs.length > 0) {
                    console.error(chalk_1.default.red('   ✗ Failed jobs:'));
                    for (const f of failedJobs) {
                        const where = `${f.networkName} (ChainID: ${f.chainId})`;
                        console.error(chalk_1.default.red(`     - ${f.jobName} on ${where}`));
                        console.error(chalk_1.default.red(`       Error: ${f.error}`));
                    }
                }
                if (event.data?.stack) {
                    console.error(chalk_1.default.red(event.data.stack));
                }
                else if (event.data?.error) {
                    console.error(chalk_1.default.red(event.data.error));
                }
                break;
            case 'duplicate_artifact_warning':
                console.warn(`Warning: Duplicate artifact contractName found: "${event.data.contractName}". Name-based lookup disabled - use hash or path references instead.`);
                break;
            case 'missing_network_config_warning':
                console.warn(chalk_1.default.yellow(`Warning: Could not find network configurations for specified chain IDs: ${event.data.missingChainIds.join(', ')}`));
                break;
            case 'unhandled_rejection':
                console.error(chalk_1.default.red('Unhandled Rejection:'), event.data.error, chalk_1.default.red('origin:'), event.data.origin);
                break;
            case 'uncaught_exception':
                console.error(chalk_1.default.red('Uncaught Exception:'), event.data.error);
                break;
            case 'cli_error':
                console.error(chalk_1.default.red('Error:'), event.data.message);
                break;
            case 'verification_started':
                console.log(chalk_1.default.gray(`        🔍 Verifying contract on ${event.data.platform} (${event.data.networkName})...`));
                break;
            case 'verification_submitted':
                if (event.data.guid && event.data.guid !== 'N/A') {
                    console.log(chalk_1.default.gray(`        📝 Verification submitted to ${event.data.platform} (GUID: ${event.data.guid})`));
                }
                break;
            case 'verification_completed':
                if (event.data.message.includes('already verified')) {
                    console.log(chalk_1.default.yellow(`        ✓ Already verified on ${event.data.platform}`));
                }
                else {
                    console.log(chalk_1.default.green(`        ✅ ${event.data.message} on ${event.data.platform}`));
                }
                break;
            case 'verification_failed':
                console.log(chalk_1.default.red(`        ❌ Verification failed on ${event.data.platform}: ${event.data.error}`));
                break;
            case 'verification_retry':
                console.log(chalk_1.default.gray(`        Verification retry ${event.data.attempt}/${event.data.maxRetries}: ${event.data.error}`));
                break;
            case 'verification_skipped':
                console.log(chalk_1.default.yellow(`        ⚠️  ${event.data.reason}`));
                break;
            case 'verification_warnings_report':
                console.log(chalk_1.default.yellow('\n📋 Verification Warnings Report'));
                console.log(chalk_1.default.yellow(`   Total warnings: ${event.data.totalWarnings}`));
                console.log('');
                if (event.data.warnings && event.data.warnings.length > 0) {
                    for (const warning of event.data.warnings) {
                        console.log(chalk_1.default.red(`   ❌ ${warning.actionName} (${warning.contractName})`));
                        console.log(chalk_1.default.gray(`      Address: ${warning.address}`));
                        console.log(chalk_1.default.gray(`      Platform: ${warning.platform}`));
                        if (warning.networkName) {
                            console.log(chalk_1.default.gray(`      Network: ${warning.networkName}`));
                        }
                        console.log(chalk_1.default.gray(`      Error: ${warning.error}`));
                        console.log('');
                    }
                }
                break;
            case 'contract_created':
                console.log(chalk_1.default.gray(`        contract: ${event.data.contractAddress}`));
                break;
            case 'context_disposal_warning':
                console.warn(chalk_1.default.yellow(`Warning: context cleanup issue for job "${event.data.jobName}" on ${event.data.networkName}: ${event.data.error}`));
                break;
            case 'deprecated_jobs_skipped':
                if (Array.isArray(event.data.jobs) && event.data.jobs.length > 0) {
                    const names = event.data.jobs.map((j) => typeof j === 'string' ? j : j.name).filter(Boolean);
                    console.log(chalk_1.default.yellow(`Skipping deprecated jobs (not requested): ${names.join(', ')}`));
                }
                break;
            case 'run_summary':
                console.log(chalk_1.default.blue('\n5. Summary'));
                console.log(chalk_1.default.gray(`   Networks: ${event.data.networkCount}, Jobs: ${event.data.jobCount}`));
                console.log(chalk_1.default.green(`   ✓ Success: ${event.data.successCount}`));
                if (event.data.skippedCount > 0)
                    console.log(chalk_1.default.yellow(`   ↪ Skipped: ${event.data.skippedCount}`));
                if (event.data.failedCount > 0)
                    console.log(chalk_1.default.red(`   ✗ Failed: ${event.data.failedCount}`));
                if (Array.isArray(event.data.keyContracts) && event.data.keyContracts.length > 0) {
                    console.log(chalk_1.default.gray('   Key contracts:'));
                    for (const c of event.data.keyContracts) {
                        console.log(chalk_1.default.gray(`     - ${c.job}.${c.action}: ${c.address}`));
                    }
                }
                break;
            case 'job_execution_failed':
                console.error(chalk_1.default.red.bold(`❌ Job "${event.data.jobName}" failed on ${event.data.networkName} (Chain ID: ${event.data.chainId})`));
                console.error(chalk_1.default.red(`   Error: ${event.data.error}`));
                break;
            case 'action_completed':
                console.log(chalk_1.default.green(`      ✅ ${event.data.result}`));
                break;
            case 'action_failed':
                console.log(chalk_1.default.red(`      ❌ ${event.data.message}`));
                break;
            case 'action_info':
                console.log(chalk_1.default.gray(`      ℹ️  ${event.data.message}`));
                break;
            case 'debug_info':
                const levelPrefix = event.level.toUpperCase();
                const levelColor = event.level === 'warn' ? chalk_1.default.yellow :
                    event.level === 'info' ? chalk_1.default.blue :
                        chalk_1.default.gray;
                console.log(levelColor(`        [${levelPrefix}] ${event.data.message}`));
                break;
            default:
                if (this.verbosity >= 3) {
                    const level = event.level?.toUpperCase?.() || 'DEBUG';
                    const type = event.type || 'event';
                    const msg = event.data?.message;
                    if (msg) {
                        console.log(chalk_1.default.gray(`        [${level}] ${type}: ${msg}`));
                    }
                }
                break;
        }
    }
    destroy() {
        this.emitter.removeAllListeners();
    }
}
exports.CLIEventAdapter = CLIEventAdapter;
//# sourceMappingURL=cli-adapter.js.map