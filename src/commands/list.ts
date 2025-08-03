import { Command } from 'commander'
import chalk from 'chalk'
import * as path from 'path'
import { loadProject, projectOption, noStdOption, verbosityOption } from './common'
import { loadNetworks } from '../lib/network-loader'
import { setVerbosity } from '../index'

interface ListOptions {
  project: string
  std: boolean
  verbose: number
}

interface NetworksListOptions {
  project: string
  verbose: number
  onlyTestnets?: boolean
  onlyNonTestnets?: boolean
}

export function makeListCommand(): Command {
  const list = new Command('list')
    .description('List project resources like jobs, contracts, and networks')

  const listJobs = new Command('jobs')
    .description('List all available jobs in the project')
  projectOption(listJobs)
  noStdOption(listJobs)
  verbosityOption(listJobs)
  listJobs.action(async (options: ListOptions) => {
    try {
      // Set verbosity level for logging
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      const loader = await loadProject(options.project, { 
        loadStdTemplates: options.std !== false 
      })
      console.log(chalk.bold.underline('Available Jobs:'))
      if (loader.jobs.size === 0) {
        console.log(chalk.yellow('No jobs found in this project.'))
        return
      }
      for (const job of loader.jobs.values()) {
        console.log(`- ${chalk.cyan(job.name)} (v${job.version})`)
        if (job.description) {
          console.log(`  ${chalk.gray(job.description)}`)
        }
      }
    } catch (error) {
      console.error(chalk.red('Error listing jobs:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  const listContracts = new Command('contracts')
    .description('List all contracts found in the project')
  projectOption(listContracts)
  noStdOption(listContracts)
  verbosityOption(listContracts)
  listContracts.action(async (options: ListOptions) => {
    try {
      // Set verbosity level for logging
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      const loader = await loadProject(options.project, { 
        loadStdTemplates: options.std !== false 
      })
      const contracts = loader.contractRepository.getAll()
      const ambiguousRefs = loader.contractRepository.getAmbiguousReferences()

      // Display contracts
      console.log(chalk.bold.underline('Available Contracts:'))
      if (contracts.length === 0) {
        console.log(chalk.yellow('No contracts found in this project.'))
      } else {
        for (const contract of contracts) {
          const name = contract.contractName || 'Unknown'
          const source = contract.sourceName || 'Unknown'
          console.log(`- ${chalk.cyan(name)} (${source})`)
          console.log(`  ${chalk.gray('Unique Hash:')} ${contract.uniqueHash}`)
          if (contract.buildInfoId) {
            console.log(`  ${chalk.gray('Build Info ID:')} ${contract.buildInfoId}`)
          }
          console.log(`  ${chalk.gray('Sources:')} ${Array.from(contract._sources).map(p => path.relative(options.project, p)).join(', ')}`)
        }
      }

      // Display ambiguous references if any
      if (ambiguousRefs.length > 0) {
        console.log('\n' + chalk.bold.underline(chalk.yellow('Ambiguous References:')))
        console.log(chalk.yellow('The following references point to multiple contracts:'))
        for (const ref of ambiguousRefs) {
          console.log(`- ${chalk.red(ref)}`)
        }
        console.log(chalk.yellow('Use the unique hash or a more specific path to reference these contracts.'))
      }

      if (contracts.length === 0) {
        console.log('\n' + chalk.yellow('No contracts found in this project. Make sure you have artifact files or build-info files in your project.'))
      }
    } catch (error) {
      console.error(chalk.red('Error listing contracts:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  const listTemplates = new Command('templates')
    .description('List all available templates')
  projectOption(listTemplates)
  noStdOption(listTemplates)
  verbosityOption(listTemplates)
  listTemplates.action(async (options: ListOptions) => {
    try {
      // Set verbosity level for logging
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      const loader = await loadProject(options.project, { 
        loadStdTemplates: options.std !== false 
      })
      console.log(chalk.bold.underline('Available Templates:'))
      if (loader.templates.size === 0) {
        console.log(chalk.yellow('No templates found.'))
        return
      }
      for (const template of loader.templates.values()) {
        console.log(`- ${chalk.cyan(template.name)}`)
        if (template.description) {
          console.log(`  ${chalk.gray(template.description)}`)
        }
      }
    } catch (error) {
      console.error(chalk.red('Error listing templates:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  const listNetworks = new Command('networks')
    .description('List all configured networks')
  projectOption(listNetworks)
  verbosityOption(listNetworks)
  listNetworks.option('--only-testnets', 'Show only test networks')
  listNetworks.option('--only-non-testnets', 'Show only non-test networks')
  listNetworks.action(async (options: NetworksListOptions) => {
    try {
      // Set verbosity level for logging
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      const networks = await loadNetworks(options.project)
      
      // Apply filtering if specified
      let filteredNetworks = networks
      if (options.onlyTestnets) {
        filteredNetworks = networks.filter(network => network.testnet === true)
      } else if (options.onlyNonTestnets) {
        filteredNetworks = networks.filter(network => network.testnet !== true)
      }
      
      console.log(chalk.bold.underline('Available Networks:'))
      if (filteredNetworks.length === 0) {
        if (options.onlyTestnets) {
          console.log(chalk.yellow('No test networks configured.'))
        } else if (options.onlyNonTestnets) {
          console.log(chalk.yellow('No non-test networks configured.'))
        } else {
          console.log(chalk.yellow('No networks configured. Create a networks.yaml file in your project root.'))
        }
        return
      }
      
      for (const network of filteredNetworks) {
        const testnetIndicator = network.testnet ? chalk.green('(testnet)') : ''
        console.log(`- ${chalk.cyan(network.name)} (Chain ID: ${network.chainId}) ${testnetIndicator}`)
        console.log(`  ${chalk.gray(`RPC: ${network.rpcUrl}`)}`)
      }
    } catch (error) {
      console.error(chalk.red('Error listing networks:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  list.addCommand(listJobs)
  list.addCommand(listContracts)
  list.addCommand(listTemplates)
  list.addCommand(listNetworks)

  return list
}