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
      const engine = new ExecutionEngine(this.loader.templates, this.events, verificationRegistry)
      
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
          
          try {
                      const context = new ExecutionContext(
            network, 
            this.options.privateKey, 
            this.loader.contractRepository,
            this.options.etherscanApiKey
          )
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
    if (!this.options.runJobs || this.options.runJobs.length === 0) {
      return fullOrder // Run all jobs
    }
    
    const jobsToRun = new Set<string>()
    for (const jobName of this.options.runJobs) {
      if (!this.loader.jobs.has(jobName)) {
        throw new Error(`Specified job "${jobName}" not found in project.`)
      }
      jobsToRun.add(jobName)
      const dependencies = this.graph?.getDependencies(jobName) || new Set()
      dependencies.forEach((dep: string) => jobsToRun.add(dep))
    }
    
    // Filter the original execution order to only include the required jobs, preserving the correct sequence.
    return fullOrder.filter(jobName => jobsToRun.has(jobName))
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
   * Writes the collected deployment results to JSON files in the output directory.
   */
  private async writeOutputFiles(): Promise<void> {
    if (this.results.size === 0) {
      this.events.emitEvent({
        type: 'no_outputs',
        level: 'warn'
      })
      return
    }

    const outputDir = path.join(this.options.projectRoot, 'output')
    await fs.mkdir(outputDir, { recursive: true })
    
    this.events.emitEvent({
      type: 'output_writing_started',
      level: 'info'
    })

    for (const [jobName, resultData] of this.results.entries()) {
      const outputFilePath = path.join(outputDir, `${jobName}.json`)
      
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
   * Filters outputs to only include those from actions marked with output: true.
   * If no actions have output: true, includes all outputs (backward compatibility).
   */
  private filterOutputsByActionFlags(outputs: Map<string, unknown>, job: Job): Record<string, unknown> {
    // Get list of actions that should contribute to output
    const outputActions = job.actions.filter(action => action.output === true)
    
    // If no actions explicitly set output: true, include all outputs (backward compatibility)
    if (outputActions.length === 0) {
      return Object.fromEntries(outputs)
    }
    
    // Filter outputs to only include those from actions with output: true
    const filtered = new Map<string, unknown>()
    for (const [key, value] of outputs) {
      // Check if this output key matches any of the output-enabled actions
      for (const action of outputActions) {
        if (key.startsWith(`${action.name}.`)) {
          filtered.set(key, value)
          break
        }
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