import * as fs from 'fs/promises'
import * as path from 'path'

import { ProjectLoader, ProjectLoaderOptions } from './core/loader'
import { DependencyGraph } from './core/graph'
import { ExecutionEngine } from './core/engine'
import { createDefaultVerificationRegistry } from './verification/etherscan'
import { ExecutionContext } from './core/context'
import { Network, Job } from './types'
import { DeploymentEventEmitter, deploymentEvents } from './events'
import type { RunSummaryEvent } from './events'

/**
 * Options for configuring a Deployer instance.
 */
export interface DeployerOptions {
  /** The root directory of the deployment project. */
  projectRoot: string
  
  /** The private key of the EOA to be used as the signer/relayer. Optional if an implicit sender from RPC is desired. */
  privateKey?: string
  
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

  /** Optional: Show end-of-run summary (default: true). */
  showSummary?: boolean
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
  private readonly showSummary: boolean
  
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
    this.showSummary = options.showSummary !== false
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
      const engine = new ExecutionEngine(this.loader.templates, {
        eventEmitter: this.events,
        verificationRegistry,
        noPostCheckConditions: this.noPostCheckConditions
      })
      
      // Track if any jobs have failed
      let hasFailures = false
      // Emit signer info once per network (chainId)
      const signerInfoPrintedForChain = new Set<number>()
      
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
            
            // Emit signer info once per network using the first job's context
            if (!signerInfoPrintedForChain.has(network.chainId)) {
              try {
                const getSignerFn = (context as unknown as {
                  getResolvedSigner?: () => Promise<{ getAddress: () => Promise<string> }>
                  signer?: { getAddress: () => Promise<string> }
                }).getResolvedSigner
                const signer = getSignerFn
                  ? await getSignerFn.call(context)
                  : (context as unknown as { signer?: { getAddress: () => Promise<string> } }).signer
                if (signer && typeof signer.getAddress === 'function') {
                  const address = await signer.getAddress()
                  // provider may not exist on mocked contexts; guard for it
                  const provider = (context as unknown as {
                    provider?: { getBalance: (addr: string) => Promise<bigint | number | { toString: () => string }> }
                  }).provider
                  if (provider && typeof provider.getBalance === 'function') {
                    const balanceBn = await provider.getBalance(address)
                    const balanceWei = balanceBn.toString()
                    const balanceEth = (Number(balanceBn) / 1e18).toString()
                    this.events.emitEvent({
                      type: 'network_signer_info',
                      level: 'info',
                      data: {
                        networkName: network.name,
                        chainId: network.chainId,
                        address,
                        balanceWei,
                        balance: balanceEth
                      }
                    })
                  }
                }
              } catch {
                // ignore non-fatal signer info errors
              } finally {
                signerInfoPrintedForChain.add(network.chainId)
              }
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

      // Emit end-of-run summary before final status
      if (this.showSummary) {
        this.emitRunSummary(hasFailures)
      }

      // Check if any jobs failed and exit with error if so
      if (hasFailures) {
        const error = new Error('One or more jobs failed during execution')

        // Build a flat list of failed jobs with network context and error messages
        const failedJobs: Array<{ jobName: string; networkName: string; chainId: number; error: string }> = []
        for (const [, result] of this.results) {
          const job = result.job
          for (const [chainId, netResult] of result.outputs) {
            if (netResult.status === 'error') {
              // Resolve network name from configured networks (fallback to chainId if missing)
              const network = this.options.networks.find(n => n.chainId === chainId)
              failedJobs.push({
                jobName: job.name,
                networkName: network?.name || `chain-${chainId}`,
                chainId,
                error: String(netResult.data)
              })
            }
          }
        }

        this.events.emitEvent({
          type: 'deployment_failed',
          level: 'error',
          data: {
            error: error.message,
            stack: error.stack,
            failedJobs
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
   * Emit a concise run summary event for the CLI to render at the end.
   */
  private emitRunSummary(hasFailures: boolean): void {
    // Compute counts
    const jobCount = this.results.size
    let successCount = 0
    let failedCount = 0
    const skippedCount = 0

    // Detect skipped by comparing planned jobs across networks vs executed entries
    // Here we approximate: an entry exists per job and per network outcome. We count
    // successes/errors; skips were emitted as events during execution and are not persisted
    // in results. We cannot perfectly reconstruct skipped count without tracking, so we
    // expose it as 0 for now; could be improved by tracking per-network skip events.

    for (const [, result] of this.results) {
      for (const [, netResult] of result.outputs) {
        if (netResult.status === 'success') successCount++
        else failedCount++
      }
    }

    // Collect key contract addresses from outputs for quick visibility
    const keyContracts: Array<{ job: string; action: string; address: string }> = []
    for (const [, result] of this.results) {
      for (const [, netResult] of result.outputs) {
        if (netResult.status !== 'success') continue
        const outputs = netResult.data as Map<string, unknown>
        for (const [k, v] of outputs) {
          if (k.endsWith('.address') && typeof v === 'string') {
            const action = k.split('.')[0]
            keyContracts.push({ job: result.job.name, action, address: v })
          }
        }
      }
    }

    const summaryEvent = {
      type: 'run_summary',
      level: (hasFailures ? 'warn' : 'info') as 'info' | 'warn',
      data: {
        networkCount: this.options.networks.length,
        jobCount,
        successCount,
        failedCount,
        skippedCount,
        keyContracts: keyContracts.slice(0, 10)
      }
    } satisfies Omit<RunSummaryEvent, 'timestamp'>

    this.events.emitEvent(summaryEvent)
  }

  /**
   * Determines the final, ordered list of jobs to execute based on user input.
   * If a user requests specific jobs, this ensures all their dependencies are also included.
   */
  private getJobExecutionPlan(fullOrder: string[]): string[] {
    // Expand provided runJobs to concrete job names by supporting simple glob patterns
    const expandRunJobs = (patterns: string[]): string[] => {
      const allJobNames = Array.from(this.loader.jobs.keys())

      const isPattern = (s: string): boolean => /[*?]/.test(s)
      const escapeRegex = (s: string): string => s.replace(/[-\\^$+?.()|[\]{}*?]/g, '\\$&')
      const patternToRegex = (pattern: string): RegExp => {
        // Escape regex metacharacters, then translate wildcard tokens
        const escaped = escapeRegex(pattern)
          .replace(/\\\*/g, '.*')  // escaped '*' -> '.*'
          .replace(/\\\?/g, '.')   // escaped '?' -> '.'
        return new RegExp(`^${escaped}$`)
      }

      const expanded: string[] = []
      const seen = new Set<string>()

      for (const p of patterns) {
        if (!isPattern(p)) {
          // Exact name; validate exists
          if (!this.loader.jobs.has(p)) {
            throw new Error(`Specified job "${p}" not found in project.`)
          }
          if (!seen.has(p)) {
            seen.add(p)
            expanded.push(p)
          }
          continue
        }

        const re = patternToRegex(p)
        const matches = allJobNames.filter(name => re.test(name))
        if (matches.length === 0) {
          throw new Error(`Job pattern "${p}" did not match any jobs in project.`)
        }
        for (const m of matches) {
          if (!seen.has(m)) {
            seen.add(m)
            expanded.push(m)
          }
        }
      }

      return expanded
    }

    // Helper to decide if a job is deprecated
    const isDeprecated = (jobName: string): boolean => {
      const j = this.loader.jobs.get(jobName)
      return !!(j && (j as { deprecated?: boolean }).deprecated === true)
    }

    // If user didn't specify jobs explicitly, include all non-deprecated jobs.
    // Additionally, ALWAYS include deprecated jobs when they are dependencies of any non-deprecated job.
    if (!this.options.runJobs || this.options.runJobs.length === 0) {
      if (this.options.runDeprecated) {
        return fullOrder
      }

      const nonDeprecatedJobs = new Set(fullOrder.filter(name => !isDeprecated(name)))

      // Collect deprecated jobs that are required by any non-deprecated job
      const requiredDeprecated = new Set<string>()
      for (const jobName of nonDeprecatedJobs) {
        const deps = this.graph?.getDependencies(jobName) || new Set<string>()
        for (const dep of deps) {
          if (isDeprecated(dep)) {
            requiredDeprecated.add(dep)
          }
        }
      }

      const allowed = new Set<string>([...nonDeprecatedJobs, ...requiredDeprecated])
      return fullOrder.filter(name => allowed.has(name))
    }
    
    // Expand patterns to concrete names
    const expandedRunJobs = expandRunJobs(this.options.runJobs)
    const explicitlyRequested = new Set<string>(expandedRunJobs)

    const jobsToRun = new Set<string>()
    for (const jobName of expandedRunJobs) {
      jobsToRun.add(jobName)
      const dependencies = this.graph?.getDependencies(jobName) || new Set()
      dependencies.forEach((dep: string) => jobsToRun.add(dep))
    }

    // Deprecated dependencies must be kept even when --run-deprecated is not set.
    // Only drop deprecated jobs that are neither explicitly requested nor required as a dependency.
    const depsOfRequested = new Set<string>()
    for (const jobName of expandedRunJobs) {
      const deps = this.graph?.getDependencies(jobName) || new Set<string>()
      deps.forEach(d => depsOfRequested.add(d))
    }

    const filtered = Array.from(jobsToRun).filter(name => {
      if (!isDeprecated(name)) return true
      if (explicitlyRequested.has(name)) return true
      if (depsOfRequested.has(name)) return true // keep deprecated dependency
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
    const jobWithNetworkFilters = job as Job & { only_networks?: number[]; skip_networks?: number[]; min_evm_version?: string }

    // Check only_networks: if present, the job only runs on these networks.
    // If the network is NOT in only_networks, skip immediately. If it IS included, continue to min_evm_version checks.
    const hasOnly = !!(jobWithNetworkFilters.only_networks && jobWithNetworkFilters.only_networks.length > 0)
    if (hasOnly) {
      if (!jobWithNetworkFilters.only_networks!.includes(network.chainId)) {
        return true
      }
      // When only_networks is present and the network is allowed, skip_networks is ignored by design.
    } else {
      // Only consider skip_networks when only_networks is not set.
      if (jobWithNetworkFilters.skip_networks && jobWithNetworkFilters.skip_networks.length > 0) {
        if (jobWithNetworkFilters.skip_networks.includes(network.chainId)) {
          return true
        }
      }
    }
    
    // Check minimal EVM hardfork requirement if present on job and network declares an EVM version
    if (jobWithNetworkFilters.min_evm_version) {
      const jobMin = this.normalizeEvmVersion(jobWithNetworkFilters.min_evm_version)
      const chainEvm = network.evmVersion ? this.normalizeEvmVersion(network.evmVersion) : undefined
      if (jobMin && chainEvm) {
        // Skip when chain's EVM is older than job's minimal requirement
        return this.compareEvmVersions(chainEvm, jobMin) < 0
      }
      // If network has no evmVersion declared, do not skip (assume compatible)
    }
    
    return false // Run by default
  }

  /**
   * Normalizes common EVM hardfork identifiers to a canonical lowercase token.
   */
  private normalizeEvmVersion(identifier: string | undefined): string | undefined {
    if (!identifier) return undefined
    const id = String(identifier).trim().toLowerCase()
    const aliasMap: Record<string, string> = {
      frontier: 'frontier',
      homestead: 'homestead',
      'tangerine whistle': 'tangerine',
      tangerine: 'tangerine',
      'spurious dragon': 'spuriousdragon',
      spuriousdragon: 'spuriousdragon',
      byzantium: 'byzantium',
      constantinople: 'constantinople',
      petersburg: 'petersburg',
      istanbul: 'istanbul',
      berlin: 'berlin',
      london: 'london',
      // The Merge hardfork is referred to as Paris in solidity's evmVersion naming
      merge: 'paris',
      paris: 'paris',
      shanghai: 'shanghai',
      // a.k.a. Cancun + Deneb (Dencun)
      cancun: 'cancun',
      dencun: 'cancun',
      prague: 'prague',
    }
    return aliasMap[id] || undefined
  }

  /**
   * Compares canonical EVM hardfork tokens. Returns -1 if a < b, 0 if equal, 1 if a > b.
   * Unknown tokens are treated as incomparable; caller should guard for undefined.
   */
  private compareEvmVersions(a: string, b: string): number {
    const order = [
      'frontier',
      'homestead',
      'tangerine',
      'spuriousdragon',
      'byzantium',
      'constantinople',
      'petersburg',
      'istanbul',
      'berlin',
      'london',
      'paris',
      'shanghai',
      'cancun',
      'prague'
    ]
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia === -1 || ib === -1) return 0
    if (ia < ib) return -1
    if (ia > ib) return 1
    return 0
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