import * as fs from 'fs/promises'
import * as path from 'path'

import { ProjectLoader, ProjectLoaderOptions } from './core/loader'
import { DependencyGraph } from './core/graph'
import { ExecutionEngine } from './core/engine'
import { createDefaultVerificationRegistry } from './verification/etherscan'
import { ExecutionContext } from './core/context'
import { Network, Job } from './types'
import { DeploymentEventEmitter, deploymentEvents } from './events'

/**
 * Options for configuring a Deployer instance.
 */
export interface DeployerOptions {
  /** The root directory of the deployment project. */
  projectRoot: string
  
  /** The private key of the EOA to be used as the signer/relayer. */
  privateKey: string
  
  /** An array of network configurations to use for deployment. */
  networks: Network[]
  
  /** Optional: An array of job names to execute. If not provided, all jobs are considered. */
  runJobs?: string[]
  
  /** Optional: An array of chain IDs to run on. If not provided, all configured networks are used. */
  runOnNetworks?: number[]
  
  /** Optional: Custom event emitter instance. If not provided, uses the global singleton. */
  eventEmitter?: DeploymentEventEmitter
  
  /** Optional: Project loader options (e.g., whether to load standard templates). */
  loaderOptions?: ProjectLoaderOptions
  
  /** Optional Etherscan API key for contract verification. */
  etherscanApiKey?: string
  
  /** Optional: Stop execution as soon as any job fails. Defaults to false. */
  failEarly?: boolean
  
  /** Optional: Skip post-execution check of skip conditions. Defaults to false (post-check enabled). */
  noPostCheckConditions?: boolean

  /** Optional: When true, write outputs in a flat directory instead of mirroring the jobs dir structure. */
  flatOutput?: boolean

  /** Optional: Allow running jobs marked as deprecated when true. */
  runDeprecated?: boolean
}

/**
 * The Deployer is the top-level orchestrator for the entire deployment process.
 * It loads a project, builds the dependency graph, and executes jobs across
 * specified networks in the correct order.
 */
export class Deployer {
  private readonly options: DeployerOptions
  public readonly events: DeploymentEventEmitter
  private readonly loader: ProjectLoader
  private readonly noPostCheckConditions: boolean
  
  // Store both successful and failed execution results
  private readonly results = new Map<string, {
    job: Job;
    outputs: Map<number, { status: 'success' | 'error'; data: Map<string, unknown> | string }>
  }>()
  private graph?: DependencyGraph


  constructor(options: DeployerOptions) {
    this.options = options
    this.events = options.eventEmitter || deploymentEvents
    this.loader = new ProjectLoader(options.projectRoot, options.loaderOptions)
    this.noPostCheckConditions = options.noPostCheckConditions ?? false
  }


  /**
   * Runs the entire deployment process from loading to execution and outputting results.
   */
  public async run(): Promise<void> {
    this.events.emitEvent({
      type: 'deployment_started',
      level: 'info',
      data: {
        projectRoot: this.options.projectRoot
      }
    })
    
    try {
      // 1. Load all project artifacts, templates, and jobs.
      this.events.emitEvent({
        type: 'project_loading_started',
        level: 'info',
        data: {
          projectRoot: this.options.projectRoot
        }
      })
      
      await this.loader.load()
      
      this.events.emitEvent({
        type: 'project_loaded',
        level: 'info',
        data: {
          jobCount: this.loader.jobs.size,
          templateCount: this.loader.templates.size
        }
      })
      
      // 2. Build the dependency graph and determine execution order.
      const graph = new DependencyGraph(this.loader.jobs, this.loader.templates)
      this.graph = graph
      const jobOrder = graph.getExecutionOrder()

      // 3. Filter jobs and networks based on user options.
      const jobsToRun = this.getJobExecutionPlan(jobOrder)

      // Inform about skipped deprecated jobs (when applicable)
      if (!this.options.runDeprecated) {
        const skippedDeprecated = jobOrder.filter(name => {
          const j = this.loader.jobs.get(name) as { deprecated?: boolean } | undefined
          return !jobsToRun.includes(name) && j?.deprecated === true
        })
        if (skippedDeprecated.length > 0) {
          this.events.emitEvent({
            type: 'deprecated_jobs_skipped',
            level: 'warn',
            data: { jobs: skippedDeprecated }
          })
        }
      }
      const targetNetworks = this.getTargetNetworks()
      
      this.events.emitEvent({
        type: 'execution_plan',
        level: 'info',
        data: {
          targetNetworks: targetNetworks.map(n => ({
            name: n.name,
            chainId: n.chainId
          })),
          jobExecutionOrder: jobsToRun
        }
      })

      // 4. Execute the plan.
      const verificationRegistry = createDefaultVerificationRegistry(this.options.etherscanApiKey)
      const engine = new ExecutionEngine(this.loader.templates, this.events, verificationRegistry, this.noPostCheckConditions)
      
      // Track if any jobs have failed
      let hasFailures = false
      
      for (const network of targetNetworks) {
        this.events.emitEvent({
          type: 'network_started',
          level: 'info',
          data: {
            networkName: network.name,
            chainId: network.chainId
          }
        })
        
        for (const jobName of jobsToRun) {
          const job = this.loader.jobs.get(jobName)!
          
          if (this.shouldSkipJobOnNetwork(job, network)) {
            this.events.emitEvent({
              type: 'job_skipped',
              level: 'warn',
              data: {
                jobName,
                networkName: network.name,
                reason: 'configuration'
              }
            })
            continue
          }
          
          // Initialize results storage for this job if not exists
          if (!this.results.has(job.name)) {
            this.results.set(job.name, { job, outputs: new Map() })
          }
          
          let context: ExecutionContext | undefined
          try {
            context = new ExecutionContext(
              network,
              this.options.privateKey,
              this.loader.contractRepository,
              this.options.etherscanApiKey,
              this.loader.constants
            )
            // Set job-level constants if present (guard for mocked contexts in tests)
            if (typeof (context as unknown as { setJobConstants?: (constants: unknown) => void }).setJobConstants === 'function') {
              (context as unknown as { setJobConstants: (constants: unknown) => void }).setJobConstants(job.constants)
            }
            
            // Populate context with outputs from previously executed dependent jobs
            this.populateContextWithDependentJobOutputs(job, context, network)
            
            await engine.executeJob(job, context)
            
            // Store successful results
            this.results.get(job.name)!.outputs.set(network.chainId, {
              status: 'success',
              data: (context as { getOutputs(): Map<string, unknown> }).getOutputs()
            })
          } catch (error) {
            // Store error results
            const errorMessage = error instanceof Error ? error.message : String(error)
            this.results.get(job.name)!.outputs.set(network.chainId, {
              status: 'error',
              data: errorMessage
            })
            
            this.events.emitEvent({
              type: 'job_execution_failed',
              level: 'error',
              data: {
                jobName: job.name,
                networkName: network.name,
                chainId: network.chainId,
                error: errorMessage
              }
            })
            
            // Mark that we have failures
            hasFailures = true
            
            // If fail-early is enabled, throw the error immediately
            if (this.options.failEarly) {
              throw error
            }
            
            // Otherwise, continue to next job/network
          } finally {
            // Clean up the context to prevent hanging connections
            if (context) {
              try {
                await context.dispose()
              } catch (disposeError) {
                // Log disposal errors but don't let them interrupt the flow
                this.events.emitEvent({
                  type: 'context_disposal_warning',
                  level: 'warn',
                  data: {
                    jobName: job.name,
                    networkName: network.name,
                    error: disposeError instanceof Error ? disposeError.message : String(disposeError)
                  }
                })
              }
            }
          }
        }
      }
      
      // 5. Write results to output files.
      await this.writeOutputFiles()

      // Check if any jobs failed and exit with error if so
      if (hasFailures) {
        const error = new Error('One or more jobs failed during execution')
        this.events.emitEvent({
          type: 'deployment_failed',
          level: 'error',
          data: {
            error: error.message,
            stack: error.stack
          }
        })
        throw error
      }

      this.events.emitEvent({
        type: 'deployment_completed',
        level: 'info'
      })
    } catch (error) {
      this.events.emitEvent({
        type: 'deployment_failed',
        level: 'error',
        data: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      })
      // Re-throw to allow CLI to exit with a non-zero code
      throw error
    }
  }

  /**
   * Determines the final, ordered list of jobs to execute based on user input.
   * If a user requests specific jobs, this ensures all their dependencies are also included.
   */
  private getJobExecutionPlan(fullOrder: string[]): string[] {
    // Helper to decide if a job is deprecated
    const isDeprecated = (jobName: string): boolean => {
      const j = this.loader.jobs.get(jobName)
      return !!(j && (j as { deprecated?: boolean }).deprecated === true)
    }

    // If user didn't specify jobs explicitly, we may need to skip deprecated ones unless runDeprecated
    if (!this.options.runJobs || this.options.runJobs.length === 0) {
      const order = this.options.runDeprecated
        ? fullOrder
        : fullOrder.filter(name => !isDeprecated(name))
      return order
    }
    
    const explicitlyRequested = new Set<string>(this.options.runJobs)

    const jobsToRun = new Set<string>()
    for (const jobName of this.options.runJobs) {
      if (!this.loader.jobs.has(jobName)) {
        throw new Error(`Specified job "${jobName}" not found in project.`)
      }
      jobsToRun.add(jobName)
      const dependencies = this.graph?.getDependencies(jobName) || new Set()
      dependencies.forEach((dep: string) => jobsToRun.add(dep))
    }

    // If deprecated jobs are not allowed, filter out deprecated jobs that were not explicitly requested.
    // Dependencies that are deprecated will be included only if they were explicitly requested by the user.
    const filtered = Array.from(jobsToRun).filter(name => {
      if (!isDeprecated(name)) return true
      // Allow if user explicitly requested this deprecated job
      if (explicitlyRequested.has(name)) return true
      // Otherwise require --run-deprecated
      return this.options.runDeprecated === true
    })
    const allowedSet = new Set(filtered)
    
    // Filter the original execution order to only include the required jobs, preserving the correct sequence.
    return fullOrder.filter(jobName => allowedSet.has(jobName))
  }

  /**
   * Determines the final list of networks to run on based on user input.
   */
  private getTargetNetworks(): Network[] {
    if (!this.options.runOnNetworks || this.options.runOnNetworks.length === 0) {
      return this.options.networks // Run on all configured networks
    }
    
    const targetChainIds = new Set(this.options.runOnNetworks)
    const filteredNetworks = this.options.networks.filter(n => targetChainIds.has(n.chainId))
    
    if (filteredNetworks.length !== this.options.runOnNetworks.length) {
        const foundIds = new Set(filteredNetworks.map(n => n.chainId))
        const missingIds = this.options.runOnNetworks.filter(id => !foundIds.has(id))
        this.events.emitEvent({
          type: 'missing_network_config_warning',
          level: 'warn',
          data: {
            missingChainIds: missingIds
          }
        })
    }
    
    return filteredNetworks
  }

  /**
   * Checks a job's `only_networks` and `skip_networks` fields to see if it should run on the given network.
   */
  private shouldSkipJobOnNetwork(job: Job, network: Network): boolean {
    // Note: This relies on `only_networks` and `skip_networks` being present on the Job type.
    const jobWithNetworkFilters = job as Job & { only_networks?: number[]; skip_networks?: number[] }

    // Check only_networks: if present, the job only runs on these networks.
    if (jobWithNetworkFilters.only_networks && jobWithNetworkFilters.only_networks.length > 0) {
      return !jobWithNetworkFilters.only_networks.includes(network.chainId)
    }
    
    // Check skip_networks: if present, the job skips these networks.
    if (jobWithNetworkFilters.skip_networks && jobWithNetworkFilters.skip_networks.length > 0) {
      return jobWithNetworkFilters.skip_networks.includes(network.chainId)
    }
    
    return false // Run by default
  }

  /**
   * Populates the execution context with outputs from previously executed dependent jobs.
   */
  private populateContextWithDependentJobOutputs(job: Job, context: ExecutionContext, network: Network): void {
    if (!job.depends_on) return

    for (const dependentJobName of job.depends_on) {
      const dependentJobResults = this.results.get(dependentJobName)
      if (!dependentJobResults) continue

      const networkResult = dependentJobResults.outputs.get(network.chainId)
      if (!networkResult || networkResult.status !== 'success') continue

      // Add outputs with job name prefixes for cross-job access
      const outputs = networkResult.data as Map<string, unknown>
      for (const [key, value] of outputs.entries()) {
        const prefixedKey = `${dependentJobName}.${key}`
        context.setOutput(prefixedKey, value)
      }
    }
  }



  /**
   * Writes the collected deployment results to JSON files in the output directory.
   * By default, mirrors the jobs directory structure under output/. When flatOutput
   * is true, writes all job JSONs directly under output/.
   */
  private async writeOutputFiles(): Promise<void> {
    if (this.results.size === 0) {
      this.events.emitEvent({
        type: 'no_outputs',
        level: 'warn'
      })
      return
    }

    const outputRoot = path.join(this.options.projectRoot, 'output')
    await fs.mkdir(outputRoot, { recursive: true })
    
    this.events.emitEvent({
      type: 'output_writing_started',
      level: 'info'
    })

    for (const [jobName, resultData] of this.results.entries()) {
      // Determine relative subpath for this job based on its source path under jobs/
      let relativeJobSubpath = `${jobName}.json`
      if (!this.options.flatOutput && resultData.job._path) {
        // Find jobs directory within project
        const jobsDir = path.join(this.options.projectRoot, 'jobs')
        const normalizedJobPath = path.normalize(resultData.job._path)
        const normalizedJobsDir = path.normalize(jobsDir)
        if (normalizedJobPath.startsWith(normalizedJobsDir)) {
          // Compute relative path from jobs dir to the yaml file, and replace extension with .json
          const relFromJobs = path.relative(normalizedJobsDir, normalizedJobPath)
          const dirPart = path.dirname(relFromJobs)
          const fileBase = path.basename(relFromJobs, path.extname(relFromJobs))
          relativeJobSubpath = dirPart === '.' ? `${fileBase}.json` : path.join(dirPart, `${fileBase}.json`)
        } else {
          // Fallback to job name if path isn't within jobs dir
          relativeJobSubpath = `${jobName}.json`
        }
      }

      const outputFilePath = path.join(outputRoot, relativeJobSubpath)
      const outputFileDir = path.dirname(outputFilePath)
      await fs.mkdir(outputFileDir, { recursive: true })
      
      // Group networks by identical status and outputs
      const groupedResults = this.groupNetworkResults(resultData.outputs, resultData.job)

      const fileContent = {
        jobName: resultData.job.name,
        jobVersion: resultData.job.version,
        lastRun: new Date().toISOString(),
        networks: groupedResults
      }
      
      await fs.writeFile(outputFilePath, JSON.stringify(fileContent, null, 2))
      this.events.emitEvent({
        type: 'output_file_written',
        level: 'info',
        data: {
          relativePath: path.relative(this.options.projectRoot, outputFilePath)
        }
      })
    }
  }

  /**
   * Filters outputs according to job actions' output selection:
   * - output: true  -> include all outputs for that action
   * - output: false -> exclude outputs for that action
   * - output: object -> include ONLY the specified keys, resolved from context if they are placeholders
   *
   * If no actions have output: true or object (i.e., only false/undefined), includes all outputs (backward compatibility),
   * but excludes dependency outputs when there are explicit dependencies defined.
   */
  private filterOutputsByActionFlags(outputs: Map<string, unknown>, job: Job): Record<string, unknown> {
    // Partition actions by output config
    const actionsWithCustomMap = job.actions.filter(a => a.output && typeof a.output === 'object' && a.output !== null) as Array<Job['actions'][number] & { output: Record<string, unknown> }>
    const actionsWithTrue = job.actions.filter(a => a.output === true)
    const actionsWithFalse = new Set(job.actions.filter(a => a.output === false).map(a => a.name))

    // If there are any custom maps, include only those mapped keys for those actions.
    // Collect explicit inclusions here.
    const result = new Map<string, unknown>()

    // Helper to include by prefix
    const includeAllForAction = (actionName: string) => {
      for (const [key, value] of outputs) {
        if (key.startsWith(`${actionName}.`)) {
          result.set(key, value)
        }
      }
    }

    // 1) Handle custom output maps (highest precedence and explicit selection)
    if (actionsWithCustomMap.length > 0) {
      for (const action of actionsWithCustomMap) {
        const prefix = `${action.name}.`
        // For mapped keys, accept either fully qualified keys (e.g., "txHash") which we map to `${action.name}.txHash`
        // or already-qualified keys (rare). We'll normalize to prefixed keys in the output.
        for (const mappedKey of Object.keys(action.output)) {
          // If user provided fully-qualified "action.key", strip if redundant
          const normalizedKey = mappedKey.startsWith(prefix) ? mappedKey : `${prefix}${mappedKey}`
          // Only include if present in outputs map
          if (outputs.has(normalizedKey)) {
            result.set(normalizedKey, outputs.get(normalizedKey)!)
          }
        }
      }
      // Note: when any custom maps exist, we DO NOT automatically include actionsWithTrue;
      // the requirement states "if action specifies custom output, then the output is defined by them and not by the template".
      // That means for those actions, only mapped keys are included. For other actions (without custom maps),
      // they will be handled by output:true rules below.
    }

    // 2) Include all for actions marked output: true (that do not have a custom map)
    const actionsWithTrueNames = new Set(actionsWithTrue.map(a => a.name))
    for (const actionName of actionsWithTrueNames) {
      // If this action also had a custom map, custom map already handled it and should be authoritative.
      const hadCustom = actionsWithCustomMap.some(a => a.name === actionName)
      if (!hadCustom) {
        includeAllForAction(actionName)
      }
    }

    // 3) Exclude any actions explicitly marked false (they won't be included by rules above anyway)

    // If we have any inclusions (custom maps or trues), return them
    if (result.size > 0) {
      // Additionally, filter out any accidentally included outputs from actions marked false
      for (const falseActionName of actionsWithFalse) {
        for (const key of Array.from(result.keys())) {
          if (key.startsWith(`${falseActionName}.`)) {
            result.delete(key)
          }
        }
      }
      return Object.fromEntries(result)
    }

    // 4) Backward compatibility: include all outputs if no action opted-in via true/object.
    // Exclude dependency outputs if the job has explicit dependencies.
    if (job.depends_on && job.depends_on.length > 0) {
      return this.filterOutDependencyOutputs(outputs, job)
    }
    return Object.fromEntries(outputs)
  }

  /**
   * Filters out dependency outputs from the outputs map.
   * Dependency outputs are identified by being prefixed with dependency job names.
   */
  private filterOutDependencyOutputs(outputs: Map<string, unknown>, job: Job): Record<string, unknown> {
    const filtered = new Map<string, unknown>()
    
    // Get list of dependency job names
    const dependencyNames = job.depends_on || []
    
    for (const [key, value] of outputs) {
      // Check if this output key starts with any dependency job name prefix
      const isDependencyOutput = dependencyNames.some(depName => key.startsWith(`${depName}.`))
      
      // Only include outputs that are NOT from dependencies
      if (!isDependencyOutput) {
        filtered.set(key, value)
      }
    }
    
    return Object.fromEntries(filtered)
  }

  /**
   * Groups network results by status and outputs.
   * - Success states with identical outputs are grouped together with chainIds array
   * - Error states are kept separate (one entry per network)
   */
  private groupNetworkResults(outputs: Map<number, { status: 'success' | 'error'; data: Map<string, unknown> | string }>, job: Job): Array<{
    status: 'success' | 'error';
    chainIds?: string[];
    chainId?: string;
    outputs?: Record<string, unknown>;
    error?: string;
  }> {
    const successGroups = new Map<string, { chainIds: string[], outputs: Record<string, unknown> }>()
    const errorEntries: Array<{
      status: 'error';
      chainId: string;
      error: string;
    }> = []
    
    for (const [chainId, result] of outputs.entries()) {
      if (result.status === 'success') {
        // Group successful results by identical outputs, filtered by action output flags
        const outputsObj = result.data instanceof Map ? this.filterOutputsByActionFlags(result.data, job) : {}
        const key = JSON.stringify(outputsObj)
        
        if (!successGroups.has(key)) {
          successGroups.set(key, {
            chainIds: [],
            outputs: outputsObj
          })
        }
        
        successGroups.get(key)!.chainIds.push(chainId.toString())
      } else {
        // Keep error results separate - one entry per network
        errorEntries.push({
          status: 'error',
          chainId: chainId.toString(),
          error: result.data as string
        })
      }
    }
    
    // Convert success groups to array format
    const successEntries = Array.from(successGroups.values()).map(group => ({
      status: 'success' as const,
      chainIds: group.chainIds.sort(), // Sort for consistent output
      outputs: group.outputs
    }))
    
    // Return all entries: successes first, then errors
    return [...successEntries, ...errorEntries]
  }
}