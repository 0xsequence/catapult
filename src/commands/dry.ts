import { Command } from 'commander'
import chalk from 'chalk'
import { loadProject } from './common'
import { loadNetworks } from '../lib/network-loader'
import { DependencyGraph } from '../lib/core/graph'
import { projectOption, noStdOption, verbosityOption } from './common'
import { validateContractReferences, extractUsedContractReferences } from '../lib/validation/contract-references'
import { setVerbosity } from '../index'
import { Template } from '../lib/types'

interface DryRunOptions {
  project: string
  std: boolean
  network?: string[]
  verbose: number
}

/**
 * Extract only constant-like placeholders from a value, using template metadata when available.
 * A placeholder is treated as a constant candidate if:
 * - It is a bare identifier (no dot, no parentheses), AND
 * - It is NOT declared as a template argument in the current template (when template context provided)
 */
function extractConstantRefs(value: any, refs: string[], templateCtx?: Template) {
  if (typeof value === 'string') {
    const m = value.match(/^{{(.*)}}$/)
    if (m) {
      const expr = m[1].trim()

      // Skip outputs or function-like references
      if (expr.includes('.') || expr.includes('(') || expr.includes(')')) return

      // If we have a template context, and the expr matches a declared argument, it's NOT a constant
      if (templateCtx?.arguments && Object.prototype.hasOwnProperty.call(templateCtx.arguments, expr)) {
        return
      }

      // Otherwise, treat as a constant candidate
      refs.push(expr)
    }
  } else if (Array.isArray(value)) {
    for (const v of value) extractConstantRefs(v, refs, templateCtx)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) extractConstantRefs(v, refs, templateCtx)
  }
}

export function makeDryRunCommand(): Command {
  const dryRun = new Command('dry-run')
    .description('Validate project configuration and show execution plan without running transactions')
    .argument('[jobs...]', 'Specific job names to validate (and their dependencies).')
    .option('-n, --network <chainIds...>', 'One or more network chain IDs to simulate running on.')
  
  projectOption(dryRun)
  noStdOption(dryRun)
  verbosityOption(dryRun)
  
  dryRun.action(async (jobs: string[], options: DryRunOptions) => {
    try {
      // Set verbosity level for logging
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      
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
      
      // Check for ambiguous references that are actually being used
      const usedRefs = await extractUsedContractReferences(loader)
      const allAmbiguousRefs = loader.contractRepository.getAmbiguousReferences()
      const usedRefNames = usedRefs.map(ref => ref.reference)
      const usedAmbiguousRefs = allAmbiguousRefs.filter(ref => usedRefNames.includes(ref))
      
      if (usedAmbiguousRefs.length > 0) {
        console.log(chalk.red('\n   - Found ambiguous contract references being used:'))
        for (const ref of usedAmbiguousRefs) {
          console.log(chalk.red(`     ✗ "${ref}" could refer to multiple contracts`))
        }
        throw new Error(`Found ${usedAmbiguousRefs.length} ambiguous contract reference(s) being used. Please use more specific references to resolve ambiguity.`)
      }
      console.log(chalk.green('   - All used contract references are unambiguous.'))
      
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

      // Validate constant references exist
      console.log(chalk.blue('\nValidating constant references...'))
      const topLevelConstants = loader.constants
      const missingConstantRefs: Array<{ ref: string; location: string }> = []

      // Check jobs (arguments and outputs within templates are resolved at runtime; here we just check expressions)
      for (const [jobName, job] of loader.jobs.entries()) {
        // Collect refs in job actions
        for (let i = 0; i < job.actions.length; i++) {
          const action = job.actions[i]
          const refs: string[] = []
          extractConstantRefs(action.arguments, refs)
          const jobConstants = (job as any).constants || {}
          for (const r of refs) {
            if (!(r in jobConstants) && !topLevelConstants.has(r)) {
              missingConstantRefs.push({ ref: r, location: `job '${jobName}', action ${i + 1}${action.name ? ` '${action.name}'` : ''}` })
            }
          }
        }
      }

      // Check templates (setup/actions/outputs)
      for (const [templateName, template] of loader.templates.entries()) {
        // actions
        for (let i = 0; i < template.actions.length; i++) {
          const action = template.actions[i]
          const refs: string[] = []
          extractConstantRefs(action.arguments, refs, template)
          for (const r of refs) {
            if (!topLevelConstants.has(r)) {
              missingConstantRefs.push({ ref: r, location: `template '${templateName}', action ${i + 1}${action.name ? ` '${action.name}'` : ''}` })
            }
          }
        }
        // setup actions
        if (template.setup?.actions) {
          for (let i = 0; i < (template.setup.actions?.length || 0); i++) {
            const action = template.setup.actions![i]
            const refs: string[] = []
            extractConstantRefs(action.arguments, refs, template)
            for (const r of refs) {
              if (!topLevelConstants.has(r)) {
                missingConstantRefs.push({ ref: r, location: `template '${templateName}' setup, action ${i + 1}${action.name ? ` '${action.name}'` : ''}` })
              }
            }
          }
        }
        // outputs
        if (template.outputs) {
          const refs: string[] = []
          extractConstantRefs(template.outputs, refs, template)
          for (const r of refs) {
            if (!topLevelConstants.has(r)) {
              missingConstantRefs.push({ ref: r, location: `template '${templateName}' outputs` })
            }
          }
        }
      }

      if (missingConstantRefs.length > 0) {
        console.log(chalk.red('\n   - Found missing constant references:'))
        for (const m of missingConstantRefs) {
          console.log(chalk.red(`     ✗ ${m.ref} in ${m.location}`))
        }
        throw new Error(`Found ${missingConstantRefs.length} missing constant reference(s). Ensure they are defined at top-level or in the job's constants.`)
      }
      console.log(chalk.green('   - All constant references are valid.'))
      
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