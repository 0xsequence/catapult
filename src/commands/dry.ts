import { Command } from 'commander'
import chalk from 'chalk'
import { loadProject } from './common'
import { loadNetworks } from '../lib/network-loader'
import { DependencyGraph } from '../lib/core/graph'
import { projectOption, noStdOption } from './common'
import { validateContractReferences } from '../lib/validation/contract-references'

interface DryRunOptions {
  project: string
  std: boolean
  network?: string[]
}

export function makeDryRunCommand(): Command {
  const dryRun = new Command('dry-run')
    .description('Validate project configuration and show execution plan without running transactions')
    .argument('[jobs...]', 'Specific job names to validate (and their dependencies).')
    .option('-n, --network <chainIds...>', 'One or more network chain IDs to simulate running on.')
  
  projectOption(dryRun)
  noStdOption(dryRun)
  
  dryRun.action(async (jobs: string[], options: DryRunOptions) => {
    try {
      console.log(chalk.bold.inverse(' DRY-RUN MODE '))
      const projectRoot = options.project
      const loader = await loadProject(projectRoot, { 
        loadStdTemplates: options.std !== false 
      })
      const allNetworks = await loadNetworks(projectRoot)

      console.log(chalk.blue('\nBuilding dependency graph...'))
      const graph = new DependencyGraph(loader.jobs, loader.templates)
      const fullOrder = graph.getExecutionOrder()
      console.log(chalk.green('   - Dependency graph built successfully.'))
      
      console.log(chalk.blue('\nContract Repository:'))
      console.log(chalk.green(`   - Found ${loader.contractRepository.getAll().length} unique contracts.`))
      
      // Check for ambiguous references
      const ambiguousRefs = loader.contractRepository.getAmbiguousReferences()
      if (ambiguousRefs.length > 0) {
        console.log(chalk.red('\n   - Found ambiguous contract references:'))
        for (const ref of ambiguousRefs) {
          console.log(chalk.red(`     ✗ "${ref}" could refer to multiple contracts`))
        }
        throw new Error(`Found ${ambiguousRefs.length} ambiguous contract reference(s). Please use more specific references to resolve ambiguity.`)
      }
      console.log(chalk.green('   - All contract references are unambiguous.'))
      
      // Validate that all Contract() references point to existing contracts
      console.log(chalk.blue('\nValidating contract references...'))
      const missingRefs = await validateContractReferences(loader)
      if (missingRefs.length > 0) {
        console.log(chalk.red('\n   - Found missing contract references:'))
        for (const ref of missingRefs) {
          console.log(chalk.red(`     ✗ ${ref.reference} in ${ref.location}`))
        }
        throw new Error(`Found ${missingRefs.length} missing contract reference(s). Please ensure all referenced contracts exist.`)
      }
      console.log(chalk.green('   - All contract references are valid.'))
      
      const runJobs = jobs.length > 0 ? jobs : undefined
      const runOnNetworks = options.network?.map(Number)

      const jobsToRun = new Set<string>()
      if (runJobs) {
        for (const jobName of runJobs) {
          if (!loader.jobs.has(jobName)) {
            throw new Error(`Specified job "${jobName}" not found in project.`)
          }
          jobsToRun.add(jobName)
          graph.getDependencies(jobName).forEach(dep => jobsToRun.add(dep))
        }
      } else {
        fullOrder.forEach(j => jobsToRun.add(j))
      }

      const jobExecutionPlan = fullOrder.filter(jobName => jobsToRun.has(jobName))
      const targetNetworks = runOnNetworks 
        ? allNetworks.filter(n => runOnNetworks.includes(n.chainId))
        : allNetworks

      console.log(chalk.blue('\nExecution Plan:'))
      console.log(chalk.gray(`   - Target Networks: ${targetNetworks.map(n => `${n.name} (ChainID: ${n.chainId})`).join(', ')}`))
      console.log(chalk.gray(`   - Job Execution Order: ${jobExecutionPlan.join(' -> ')}`))
      
      console.log(chalk.green.bold('\n✅ Dry run successful. All job and template definitions appear to be valid.'))
      
    } catch (error) {
      console.error(chalk.red.bold('\n💥 DRY RUN FAILED!'))
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  })

  return dryRun
}