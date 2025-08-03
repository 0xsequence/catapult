import { Command } from 'commander'
import chalk from 'chalk'
import { projectOption, verbosityOption } from './common'
import { loadNetworks } from '../lib/network-loader'
import { setVerbosity } from '../index'

interface UtilsOptions {
  project: string
  verbose: number
}

export function makeUtilsCommand(): Command {
  const utils = new Command('utils')
    .description('Utility commands for project management')

  const chainIdToName = new Command('chain-id-to-name')
    .description('Convert a chain ID to network name')
  projectOption(chainIdToName)
  verbosityOption(chainIdToName)

  chainIdToName.argument('<chain-id>', 'The chain ID to convert')
  chainIdToName.action(async (chainId: string, options: UtilsOptions) => {
    try {
      // Set verbosity level for logging
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      
      const chainIdNumber = parseInt(chainId, 10)
      if (isNaN(chainIdNumber)) {
        console.error(chalk.red('Invalid chain ID. Please provide a valid number.'))
        process.exit(1)
      }

      const networks = await loadNetworks(options.project)
      
      const network = networks.find(n => n.chainId === chainIdNumber)
      
      if (network) {
        console.log(network.name)
      } else {
        console.error(chalk.red(`No network found with chain ID ${chainIdNumber}`))
        process.exit(1)
      }
    } catch (error) {
      console.error(chalk.red('Error converting chain ID to network name:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  utils.addCommand(chainIdToName)

  return utils
}