import { Command } from 'commander'
import { Deployer, DeployerOptions } from '../lib/deployer'
import { loadNetworks } from '../lib/network-loader'
import { deploymentEvents } from '../lib/events'
import { projectOption, dotenvOption, noStdOption, verbosityOption, loadDotenv } from './common'
import { setVerbosity } from '../index'

interface RunOptions {
  project: string
  privateKey?: string
  network?: string[]
  dotenv?: string
  std: boolean
  etherscanApiKey?: string
  verbose: number
  failEarly: boolean
  noPostCheckConditions: boolean
  flatOutput: boolean
}
 
export function makeRunCommand(): Command {
  const run = new Command('run')
    .description('Run deployment jobs on specified networks')
    .argument('[jobs...]', 'Specific job names to run (and their dependencies). If not provided, all jobs are run.')
    .option('-k, --private-key <key>', 'Signer private key. Can also be set via PRIVATE_KEY env var.')
    .option('-n, --network <chainIds...>', 'One or more network chain IDs to run on. If not provided, runs on all configured networks.')
    .option('--etherscan-api-key <key>', 'Etherscan API key for contract verification. Can also be set via ETHERSCAN_API_KEY env var.')
    .option('--fail-early', 'Stop execution as soon as any job fails. Default: false', false)
    .option('--no-post-check-conditions', 'Skip post-execution check of skip conditions. Default: false (post-check enabled)', false)
    .option('--flat-output', 'Write output files in a single flat directory instead of mirroring the jobs directory structure. Default: false', false)
    .option('--run-deprecated', 'Allow running jobs marked as deprecated. By default deprecated jobs are skipped unless explicitly targeted.', false)

  projectOption(run)
  dotenvOption(run)
  noStdOption(run)
  verbosityOption(run)

  run.action(async (jobs: string[], options: RunOptions) => {
    try {
      loadDotenv(options)
      
      // Set verbosity level for logging
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      
      const privateKey = options.privateKey || process.env.PRIVATE_KEY
      if (!privateKey) {
        throw new Error('A private key must be provided via the --private-key option or the PRIVATE_KEY environment variable.')
      }

      const etherscanApiKey = options.etherscanApiKey || process.env.ETHERSCAN_API_KEY

      const projectRoot = options.project
      const networks = await loadNetworks(projectRoot)

      if (networks.length === 0) {
        throw new Error('No networks configured. Please create a networks.yaml file in your project root.')
      }

      const deployerOptions: DeployerOptions = {
        projectRoot,
        privateKey,
        networks,
        runJobs: jobs.length > 0 ? jobs : undefined,
        runOnNetworks: options.network?.map(Number),
        etherscanApiKey,
        failEarly: options.failEarly,
        noPostCheckConditions: options.noPostCheckConditions,
        loaderOptions: {
          loadStdTemplates: options.std !== false
        },
        flatOutput: options.flatOutput === true,
        runDeprecated: (options as { runDeprecated?: boolean }).runDeprecated === true
      } as DeployerOptions

      const deployer = new Deployer(deployerOptions)
      await deployer.run()

    } catch (error) {
      // The deployer emits its own rich error event, so we just log a generic one if something fails before that.
      if (!(error instanceof Error && error.message.includes('deployment_failed'))) {
        deploymentEvents.emitEvent({
          type: 'cli_error',
          level: 'error',
          data: {
            message: error instanceof Error ? error.message : String(error)
          }
        })
      }
      process.exit(1)
    }
  })

  return run
}