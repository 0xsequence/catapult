/**
 * Event system for structured logging throughout the deployment process.
 * Replaces direct console.log calls with rich, structured events.
 */

export interface BaseEvent {
  type: string
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
}

// Deployment lifecycle events
export interface DeploymentStartedEvent extends BaseEvent {
  type: 'deployment_started'
  level: 'info'
  data: {
    projectRoot: string
  }
}

export interface DeploymentCompletedEvent extends BaseEvent {
  type: 'deployment_completed'
  level: 'info'
}

export interface DeploymentFailedEvent extends BaseEvent {
  type: 'deployment_failed'
  level: 'error'
  data: {
    error: string
    stack?: string
    failedJobs?: Array<{
      jobName: string
      networkName: string
      chainId: number
      error: string
    }>
  }
}

// Project loading events
export interface ProjectLoadingStartedEvent extends BaseEvent {
  type: 'project_loading_started'
  level: 'info'
  data: {
    projectRoot: string
  }
}

export interface ProjectLoadedEvent extends BaseEvent {
  type: 'project_loaded'
  level: 'info'
  data: {
    jobCount: number
    templateCount: number
  }
}

// Execution plan events
export interface ExecutionPlanEvent extends BaseEvent {
  type: 'execution_plan'
  level: 'info'
  data: {
    targetNetworks: Array<{
      name: string
      chainId: number
    }>
    jobExecutionOrder: string[]
  }
}

// Job execution events
export interface JobStartedEvent extends BaseEvent {
  type: 'job_started'
  level: 'info'
  data: {
    jobName: string
    jobVersion: string
    networkName: string
    chainId: number
  }
}

export interface JobCompletedEvent extends BaseEvent {
  type: 'job_completed'
  level: 'info'
  data: {
    jobName: string
    networkName: string
    chainId: number
  }
}

export interface JobSkippedEvent extends BaseEvent {
  type: 'job_skipped'
  level: 'warn'
  data: {
    jobName: string
    networkName: string
    reason: string
  }
}

// Action execution events
export interface ActionStartedEvent extends BaseEvent {
  type: 'action_started'
  level: 'info'
  data: {
    actionName: string
    jobName: string
  }
}

export interface ActionSkippedEvent extends BaseEvent {
  type: 'action_skipped'
  level: 'info'
  data: {
    actionName: string
    reason: string
  }
}

export interface ActionCompletedEvent extends BaseEvent {
  type: 'action_completed'
  level: 'info'
  data: {
    actionName: string
    result: string
  }
}

export interface ActionFailedEvent extends BaseEvent {
  type: 'action_failed'
  level: 'error'
  data: {
    message: string
  }
}

export interface ActionInfoEvent extends BaseEvent {
  type: 'action_info'
  level: 'debug'
  data: {
    message: string
  }
}

export interface DebugInfoEvent extends BaseEvent {
  type: 'debug_info'
  level: 'debug' | 'info' | 'warn'
  data: {
    message: string
  }
}

// Template execution events
export interface TemplateEnteredEvent extends BaseEvent {
  type: 'template_entered'
  level: 'debug'
  data: {
    templateName: string
  }
}

export interface TemplateExitedEvent extends BaseEvent {
  type: 'template_exited'
  level: 'debug'
  data: {
    templateName: string
  }
}

export interface TemplateSetupStartedEvent extends BaseEvent {
  type: 'template_setup_started'
  level: 'debug'
  data: {
    templateName: string
  }
}

export interface TemplateSetupCompletedEvent extends BaseEvent {
  type: 'template_setup_completed'
  level: 'debug'
  data: {
    templateName: string
  }
}

export interface TemplateSetupSkippedEvent extends BaseEvent {
  type: 'template_setup_skipped'
  level: 'info'
  data: {
    templateName: string
    reason: string
  }
}

export interface TemplateSkippedEvent extends BaseEvent {
  type: 'template_skipped'
  level: 'info'
  data: {
    templateName: string
    reason: string
  }
}

// Transaction events
export interface PrimitiveActionEvent extends BaseEvent {
  type: 'primitive_action'
  level: 'debug'
  data: {
    actionType: string
  }
}

export interface TransactionSentEvent extends BaseEvent {
  type: 'transaction_sent'
  level: 'info'
  data: {
    to: string
    value: string
    dataPreview: string
    txHash: string
  }
}

export interface TransactionConfirmedEvent extends BaseEvent {
  type: 'transaction_confirmed'
  level: 'info'
  data: {
    txHash: string
    blockNumber: number
  }
}

// Contract lifecycle events
export interface ContractCreatedEvent extends BaseEvent {
  type: 'contract_created'
  level: 'info'
  data: {
    contractAddress: string
    txHash: string
    blockNumber: number
  }
}

// Output events
export interface OutputStoredEvent extends BaseEvent {
  type: 'output_stored'
  level: 'debug'
  data: {
    outputKey: string
    value: any
  }
}

export interface OutputFileWrittenEvent extends BaseEvent {
  type: 'output_file_written'
  level: 'info'
  data: {
    relativePath: string
  }
}

export interface NoOutputsEvent extends BaseEvent {
  type: 'no_outputs'
  level: 'warn'
}

export interface OutputWritingStartedEvent extends BaseEvent {
  type: 'output_writing_started'
  level: 'info'
}

// Warning events
export interface DuplicateArtifactWarningEvent extends BaseEvent {
  type: 'duplicate_artifact_warning'
  level: 'warn'
  data: {
    contractName: string
    path: string
  }
}

export interface MissingNetworkConfigWarningEvent extends BaseEvent {
  type: 'missing_network_config_warning'
  level: 'warn'
  data: {
    missingChainIds: number[]
  }
}

export interface ContextDisposalWarningEvent extends BaseEvent {
  type: 'context_disposal_warning'
  level: 'warn'
  data: {
    jobName: string
    networkName: string
    error: string
  }
}

export interface DeprecatedJobsSkippedEvent extends BaseEvent {
  type: 'deprecated_jobs_skipped'
  level: 'warn'
  data: {
    jobs: string[] | { name: string }[]
  }
}

// Network events
export interface NetworkStartedEvent extends BaseEvent {
  type: 'network_started'
  level: 'info'
  data: {
    networkName: string
    chainId: number
  }
}

/**
 * Emitted right after a network run starts to inform which address will be used
 * to send transactions and its current balance.
 */
export interface NetworkSignerInfoEvent extends BaseEvent {
  type: 'network_signer_info'
  level: 'info'
  data: {
    networkName: string
    chainId: number
    address: string
    balanceWei: string
    balance: string // formatted in ETH
  }
}

// Process error events
export interface UnhandledRejectionEvent extends BaseEvent {
  type: 'unhandled_rejection'
  level: 'error'
  data: {
    error: string
    origin: string
  }
}

export interface UncaughtExceptionEvent extends BaseEvent {
  type: 'uncaught_exception'
  level: 'error'
  data: {
    error: Error
  }
}

export interface CLIErrorEvent extends BaseEvent {
  type: 'cli_error'
  level: 'error'
  data: {
    message: string
  }
}

export interface JobExecutionFailedEvent extends BaseEvent {
  type: 'job_execution_failed'
  level: 'error'
  data: {
    jobName: string
    networkName: string
    chainId: number
    error: string
  }
}

export interface VerificationStartedEvent extends BaseEvent {
  type: 'verification_started'
  level: 'info'
  data: {
    actionName: string
    address: string
    contractName: string
    platform: string
    networkName: string
  }
}

export interface VerificationSubmittedEvent extends BaseEvent {
  type: 'verification_submitted'
  level: 'info'
  data: {
    actionName: string
    platform: string
    guid: string
    message: string
  }
}

export interface VerificationCompletedEvent extends BaseEvent {
  type: 'verification_completed'
  level: 'info'
  data: {
    actionName: string
    address: string
    contractName: string
    platform: string
    message: string
  }
}

export interface VerificationFailedEvent extends BaseEvent {
  type: 'verification_failed'
  level: 'error'
  data: {
    actionName: string
    address: string
    contractName: string
    platform: string
    error: string
  }
}

export interface VerificationRetryEvent extends BaseEvent {
  type: 'verification_retry'
  level: 'info'
  data: {
    platform: string
    attempt: number
    maxRetries: number
    error: string
  }
}

export interface VerificationSkippedEvent extends BaseEvent {
  type: 'verification_skipped'
  level: 'warn'
  data: {
    actionName: string
    reason: string
  }
}

export interface VerificationWarningsReportEvent extends BaseEvent {
  type: 'verification_warnings_report'
  level: 'warn'
  data: {
    totalWarnings: number
    warnings: Array<{
      actionName: string
      address: string
      contractName: string
      platform: string
      error: string
      jobName?: string
      networkName?: string
    }>
  }
}

// End-of-run summary
export interface RunSummaryEvent extends BaseEvent {
  type: 'run_summary'
  level: 'info' | 'warn'
  data: {
    networkCount: number
    jobCount: number
    successCount: number
    failedCount: number
    skippedCount: number
    keyContracts: Array<{ job: string; action: string; address: string }>
  }
}

// Union type of all events
export type DeploymentEvent =
  | DeploymentStartedEvent
  | DeploymentCompletedEvent
  | DeploymentFailedEvent
  | ProjectLoadingStartedEvent
  | ProjectLoadedEvent
  | ExecutionPlanEvent
  | JobStartedEvent
  | JobCompletedEvent
  | JobSkippedEvent
  | ActionStartedEvent
  | ActionSkippedEvent
  | ActionCompletedEvent
  | ActionFailedEvent
  | ActionInfoEvent
  | DebugInfoEvent
  | TemplateEnteredEvent
  | TemplateExitedEvent
  | TemplateSetupStartedEvent
  | TemplateSetupCompletedEvent
  | TemplateSetupSkippedEvent
  | TemplateSkippedEvent
  | PrimitiveActionEvent
  | TransactionSentEvent
  | TransactionConfirmedEvent
  | ContractCreatedEvent
  | OutputStoredEvent
  | OutputFileWrittenEvent
  | NoOutputsEvent
  | OutputWritingStartedEvent
  | DuplicateArtifactWarningEvent
  | MissingNetworkConfigWarningEvent
  | ContextDisposalWarningEvent
  | DeprecatedJobsSkippedEvent
  | NetworkStartedEvent
  | NetworkSignerInfoEvent
  | UnhandledRejectionEvent
  | UncaughtExceptionEvent
  | CLIErrorEvent
  | JobExecutionFailedEvent
  | VerificationStartedEvent
  | VerificationSubmittedEvent
  | VerificationCompletedEvent
  | VerificationFailedEvent
  | VerificationRetryEvent
  | VerificationSkippedEvent
  | VerificationWarningsReportEvent
  | RunSummaryEvent