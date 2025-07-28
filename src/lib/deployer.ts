import * as fs from 'fs/promises'
import * as path from 'path'
import chalk from 'chalk'

import { ProjectLoader } from './core/loader'
import { DependencyGraph } from './core/graph'
import { ExecutionEngine } from './core/engine'
import { ExecutionContext } from './core/context'
import { Network, Job } from './types'

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
}

/**
 * The Deployer is the top-level orchestrator for the entire deployment process.
 * It loads a project, builds the dependency graph, and executes jobs across
 * specified networks in the correct order.
 */
export class Deployer {
  private readonly options: DeployerOptions
  private readonly loader: ProjectLoader
  private graph!: DependencyGraph
  
  // Stores the results of successful job executions.
  // Map<jobName, { job: Job, outputs: Map<chainId, Map<actionOutputKey, value>> }>
  private readonly results: Map<string, { job: Job; outputs: Map<number, Map<string, any>> }> = new Map()

  constructor(options: DeployerOptions) {
    this.options = options
    this.loader = new ProjectLoader(options.projectRoot)
  }

  /**
   * Runs the entire deployment process from loading to execution and outputting results.
   */
  public async run(): Promise<void> {
    console.log(chalk.bold.inverse(' DEPLOYITO: STARTING DEPLOYMENT RUN '))
    
    try {
      // 1. Load all project artifacts, templates, and jobs.
      console.log(chalk.blue(`\n1. Loading project from: ${this.options.projectRoot}`))
      await this.loader.load()
      console.log(chalk.green(`   - Loaded ${this.loader.jobs.size} jobs, ${this.loader.templates.size} templates, and registered artifacts.`))
      
      // 2. Build the dependency graph and determine execution order.
      this.graph = new DependencyGraph(this.loader.jobs, this.loader.templates)
      const fullExecutionOrder = this.graph.getExecutionOrder()
      
      // 3. Filter jobs and networks based on user options.
      const jobExecutionPlan = this.getJobExecutionPlan(fullExecutionOrder)
      const targetNetworks = this.getTargetNetworks()
      
      console.log(chalk.blue('\n2. Execution Plan'))
      console.log(chalk.gray(`   - Target Networks: ${targetNetworks.map(n => `${n.name} (ChainID: ${n.chainId})`).join(', ')}`))
      console.log(chalk.gray(`   - Job Execution Order: ${jobExecutionPlan.join(' -> ')}`))

      // 4. Execute the plan.
      console.log(chalk.blue('\n3. Executing Jobs...'))
      const engine = new ExecutionEngine(this.loader.templates)
      
      for (const network of targetNetworks) {
        console.log(chalk.cyan.bold(`\nNetwork: ${network.name} (ChainID: ${network.chainId})`))
        
        for (const jobName of jobExecutionPlan) {
          const job = this.loader.jobs.get(jobName)!
          
          if (this.shouldSkipJobOnNetwork(job, network)) {
            console.log(chalk.yellow(`  Skipping job "${jobName}" on network "${network.name}" due to configuration.`))
            continue
          }
          
          const context = new ExecutionContext(network, this.options.privateKey, this.loader.artifactRegistry)
          await engine.executeJob(job, context)
          
          // Store successful results
          if (!this.results.has(job.name)) {
            this.results.set(job.name, { job, outputs: new Map() })
          }
          // Note: This relies on a new `getOutputs()` method in ExecutionContext.
          this.results.get(job.name)!.outputs.set(network.chainId, (context as any).getOutputs())
        }
      }
      
      // 5. Write results to output files.
      await this.writeOutputFiles()

      console.log(chalk.bold.inverse('\n DEPLOYITO: DEPLOYMENT RUN COMPLETED SUCCESSFULLY '))
    } catch (error) {
      console.error(chalk.red.bold('\n💥 DEPLOYMENT FAILED!'))
      if (error instanceof Error) {
        console.error(chalk.red(error.stack || error.message))
      } else {
        console.error(chalk.red(String(error)))
      }
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
      const dependencies = this.graph.getDependencies(jobName)
      dependencies.forEach(dep => jobsToRun.add(dep))
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
        const foundIds = new Set(filteredNetworks.map(n => n.chainId));
        const missingIds = this.options.runOnNetworks.filter(id => !foundIds.has(id));
        console.warn(chalk.yellow(`Warning: Could not find network configurations for specified chain IDs: ${missingIds.join(', ')}`));
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
      console.log(chalk.yellow('\nNo successful job executions to write to output.'))
      return
    }

    const outputDir = path.join(this.options.projectRoot, 'output')
    await fs.mkdir(outputDir, { recursive: true })
    
    console.log(chalk.blue('\n4. Writing output files...'))

    for (const [jobName, resultData] of this.results.entries()) {
      const outputFilePath = path.join(outputDir, `${jobName}.json`)
      
      const networksOutput: Record<string, any> = {}
      for (const [chainId, outputMap] of resultData.outputs.entries()) {
        networksOutput[chainId] = {
          status: 'success',
          outputs: Object.fromEntries(outputMap)
        }
      }

      const fileContent = {
        jobName: resultData.job.name,
        jobVersion: resultData.job.version,
        lastRun: new Date().toISOString(),
        networks: networksOutput
      }
      
      await fs.writeFile(outputFilePath, JSON.stringify(fileContent, null, 2))
      console.log(chalk.green(`   - Wrote: ${path.relative(this.options.projectRoot, outputFilePath)}`))
    }
  }
}