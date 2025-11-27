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
export type DeploymentStartedEvent = BaseEvent & {
  type: 'deployment_started'
  level: 'info'
  data: {
    projectRoot: string
  }
}

export type DeploymentCompletedEvent = BaseEvent & {
  type: 'deployment_completed'
  level: 'info'
}

export type DeploymentFailedEvent = BaseEvent & {
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
export type ProjectLoadingStartedEvent = BaseEvent & {
  type: 'project_loading_started'
  level: 'info'
  data: {
    projectRoot: string
  }
}

export type ProjectLoadedEvent = BaseEvent & {
  type: 'project_loaded'
  level: 'info'
  data: {
    jobCount: number
    templateCount: number
  }
}

// Execution plan events
export type ExecutionPlanEvent = BaseEvent & {
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
export type JobStartedEvent = BaseEvent & {
  type: 'job_started'
  level: 'info'
  data: {
    jobName: string
    jobVersion: string
    networkName: string
    chainId: number
  }
}

export type JobCompletedEvent = BaseEvent & {
  type: 'job_completed'
  level: 'info'
  data: {
    jobName: string
    networkName: string
    chainId: number
  }
}

export type JobSkippedEvent = BaseEvent & {
  type: 'job_skipped'
  level: 'warn'
  data: {
    jobName: string
    networkName: string
    reason: string
  }
}

// Action execution events
export type ActionStartedEvent = BaseEvent & {
  type: 'action_started'
  level: 'info'
  data: {
    actionName: string
    jobName: string
  }
}

export type ActionSkippedEvent = BaseEvent & {
  type: 'action_skipped'
  level: 'info'
  data: {
    actionName: string
    reason: string
  }
}

export type ActionCompletedEvent = BaseEvent & {
  type: 'action_completed'
  level: 'info'
  data: {
    actionName: string
    result: string
  }
}

export type ActionFailedEvent = BaseEvent & {
  type: 'action_failed'
  level: 'error'
  data: {
    message: string
  }
}

export type ActionInfoEvent = BaseEvent & {
  type: 'action_info'
  level: 'debug'
  data: {
    message: string
  }
}

export type DebugInfoEvent = BaseEvent & {
  type: 'debug_info'
  level: 'debug' | 'info' | 'warn'
  data: {
    message: string
  }
}

// Template execution events
export type TemplateEnteredEvent = BaseEvent & {
  type: 'template_entered'
  level: 'debug'
  data: {
    templateName: string
  }
}

export type TemplateExitedEvent = BaseEvent & {
  type: 'template_exited'
  level: 'debug'
  data: {
    templateName: string
  }
}

export type TemplateSetupStartedEvent = BaseEvent & {
  type: 'template_setup_started'
  level: 'debug'
  data: {
    templateName: string
  }
}

export type TemplateSetupCompletedEvent = BaseEvent & {
  type: 'template_setup_completed'
  level: 'debug'
  data: {
    templateName: string
  }
}

export type TemplateSetupSkippedEvent = BaseEvent & {
  type: 'template_setup_skipped'
  level: 'info'
  data: {
    templateName: string
    reason: string
  }
}

export type TemplateSkippedEvent = BaseEvent & {
  type: 'template_skipped'
  level: 'info'
  data: {
    templateName: string
    reason: string
  }
}

// Transaction events
export type PrimitiveActionEvent = BaseEvent & {
  type: 'primitive_action'
  level: 'debug'
  data: {
    actionType: string
  }
}

export type TransactionSentEvent = BaseEvent & {
  type: 'transaction_sent'
  level: 'info'
  data: {
    to: string
    value: string
    dataPreview: string
    txHash: string
  }
}

export type TransactionConfirmedEvent = BaseEvent & {
  type: 'transaction_confirmed'
  level: 'info'
  data: {
    txHash: string
    blockNumber: number
  }
}

// Contract lifecycle events
export type ContractCreatedEvent = BaseEvent & {
  type: 'contract_created'
  level: 'info'
  data: {
    contractAddress: string
    txHash: string
    blockNumber: number
  }
}

// Output events
export type OutputStoredEvent = BaseEvent & {
  type: 'output_stored'
  level: 'debug'
  data: {
    outputKey: string
    value: any
  }
}

export type OutputFileWrittenEvent = BaseEvent & {
  type: 'output_file_written'
  level: 'info'
  data: {
    relativePath: string
  }
}

export type NoOutputsEvent = BaseEvent & {
  type: 'no_outputs'
  level: 'warn'
}

export type OutputWritingStartedEvent = BaseEvent & {
  type: 'output_writing_started'
  level: 'info'
}

// Warning events
export type DuplicateArtifactWarningEvent = BaseEvent & {
  type: 'duplicate_artifact_warning'
  level: 'warn'
  data: {
    contractName: string
    path: string
  }
}

export type MissingNetworkConfigWarningEvent = BaseEvent & {
  type: 'missing_network_config_warning'
  level: 'warn'
  data: {
    missingChainIds: number[]
  }
}

export type ContextDisposalWarningEvent = BaseEvent & {
  type: 'context_disposal_warning'
  level: 'warn'
  data: {
    jobName: string
    networkName: string
    error: string
  }
}

export type DeprecatedJobsSkippedEvent = BaseEvent & {
  type: 'deprecated_jobs_skipped'
  level: 'warn'
  data: {
    jobs: string[] | { name: string }[]
  }
}

// Network events
export type NetworkStartedEvent = BaseEvent & {
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
export type NetworkSignerInfoEvent = BaseEvent & {
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
export type UnhandledRejectionEvent = BaseEvent & {
  type: 'unhandled_rejection'
  level: 'error'
  data: {
    error: string
    origin: string
  }
}

export type UncaughtExceptionEvent = BaseEvent & {
  type: 'uncaught_exception'
  level: 'error'
  data: {
    error: Error
  }
}

export type CLIErrorEvent = BaseEvent & {
  type: 'cli_error'
  level: 'error'
  data: {
    message: string
  }
}

export type JobExecutionFailedEvent = BaseEvent & {
  type: 'job_execution_failed'
  level: 'error'
  data: {
    jobName: string
    networkName: string
    chainId: number
    error: string
  }
}

export type VerificationStartedEvent = BaseEvent & {
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

export type VerificationSubmittedEvent = BaseEvent & {
  type: 'verification_submitted'
  level: 'info'
  data: {
    actionName: string
    platform: string
    guid: string
    message: string
  }
}

export type VerificationCompletedEvent = BaseEvent & {
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

export type VerificationFailedEvent = BaseEvent & {
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

export type VerificationRetryEvent = BaseEvent & {
  type: 'verification_retry'
  level: 'info'
  data: {
    platform: string
    attempt: number
    maxRetries: number
    error: string
  }
}

export type VerificationSkippedEvent = BaseEvent & {
  type: 'verification_skipped'
  level: 'warn'
  data: {
    actionName: string
    reason: string
  }
}

export type VerificationWarningsReportEvent = BaseEvent & {
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
export type RunSummaryEvent = BaseEvent & {
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

// Plugin action events
export type PluginActionEvent = BaseEvent & {
  type: 'plugin_action'
  level: 'info' | 'debug'
  data: {
    actionType: string
    actionName?: string
    pluginName?: string
    message?: string
    chainId?: string
    txHash?: string
    [key: string]: unknown
  }
}

export type PluginActionFailedEvent = BaseEvent & {
  type: 'plugin_action_failed'
  level: 'error'
  data: {
    actionType: string
    actionName?: string
    error: string
    [key: string]: unknown
  }
}

export type PluginActionCompletedEvent = BaseEvent & {
  type: 'plugin_action_completed'
  level: 'info'
  data: {
    actionType: string
    actionName?: string
    message?: string
    address?: string
    txHash?: string
    [key: string]: unknown
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
  | PluginActionEvent
  | PluginActionFailedEvent
  | PluginActionCompletedEvent

