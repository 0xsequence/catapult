import { Command } from 'commander'
import chalk from 'chalk'
import * as path from 'path'
import { projectOption, noStdOption, verbosityOption } from './common'
import { setVerbosity } from '../index'
import {
  generateBuildInfoFromSourceProvenance,
  ProvenanceOperationResult,
  ProvenanceRunResult,
  verifySourceProvenance
} from '../lib/provenance'

interface ProvenanceOptions {
  project: string
  std: boolean
  verbose: number
  includeDependencies?: boolean
  force?: boolean
}

export function makeProvenanceCommand(): Command {
  const provenance = new Command('provenance')
    .description('Work with build-info source provenance')

  const verify = new Command('verify')
    .description('Verify committed build-info files against source provenance')
    .argument('[jobs...]', 'Optional job names or patterns to verify. Without jobs, verifies all provenance in the project.')
    .option('--include-dependencies', 'When jobs are provided, include their dependency jobs too.', false)
  projectOption(verify)
  noStdOption(verify)
  verbosityOption(verify)
  verify.action(async (jobs: string[], options: ProvenanceOptions) => {
    try {
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      const result = await verifySourceProvenance(options.project, {
        jobs,
        includeDependencies: options.includeDependencies === true,
        loadStdTemplates: options.std !== false
      })
      printRunResult('verify', options.project, result)
      exitIfFailed(result)
    } catch (error) {
      console.error(chalk.red('Error verifying provenance:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  const generate = new Command('generate')
    .description('Generate missing build-info files from source provenance')
    .argument('[jobs...]', 'Optional job names or patterns to generate. Without jobs, generates for all provenance in the project.')
    .option('--include-dependencies', 'When jobs are provided, include their dependency jobs too.', false)
    .option('--force', 'Overwrite existing build-info files.', false)
  projectOption(generate)
  noStdOption(generate)
  verbosityOption(generate)
  generate.action(async (jobs: string[], options: ProvenanceOptions) => {
    try {
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      const result = await generateBuildInfoFromSourceProvenance(options.project, {
        jobs,
        includeDependencies: options.includeDependencies === true,
        loadStdTemplates: options.std !== false,
        force: options.force === true
      })
      printRunResult('generate', options.project, result)
      exitIfFailed(result)
    } catch (error) {
      console.error(chalk.red('Error generating build-info from provenance:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  provenance.addCommand(verify)
  provenance.addCommand(generate)
  return provenance
}

function printRunResult(command: 'verify' | 'generate', projectRoot: string, result: ProvenanceRunResult): void {
  for (const warning of result.warnings) {
    console.warn(chalk.yellow(warning))
  }

  if (result.entries.length === 0) {
    console.log(chalk.yellow('No source provenance entries found.'))
    return
  }

  for (const item of result.results) {
    printOperationResult(projectRoot, item)
  }

  const failed = result.results.filter(item => item.status === 'failed').length
  const skipped = result.results.filter(item => item.status === 'skipped').length
  const completed = result.results.length - failed - skipped
  const verb = command === 'verify' ? 'verified' : 'generated'

  if (failed > 0) {
    console.log(chalk.red(`Provenance ${command} completed with ${failed} failure(s), ${completed} ${verb}, ${skipped} skipped.`))
  } else {
    console.log(chalk.green(`Provenance ${command} completed: ${completed} ${verb}, ${skipped} skipped.`))
  }
}

function printOperationResult(projectRoot: string, result: ProvenanceOperationResult): void {
  const target = path.relative(projectRoot, result.entry.buildInfoPath)
  const source = path.relative(projectRoot, result.entry.sourceDocumentPath)
  const prefix = result.status === 'failed'
    ? chalk.red('failed')
    : result.status === 'skipped'
      ? chalk.yellow('skipped')
      : chalk.green(result.status)

  console.log(`${prefix} ${target} ${chalk.gray(`[${source}]`)} - ${result.message}`)
}

function exitIfFailed(result: ProvenanceRunResult): void {
  if (result.results.some(item => item.status === 'failed')) {
    process.exit(1)
  }
}
