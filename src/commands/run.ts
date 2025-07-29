import { Command } from 'commander'
import { Deployer, DeployerOptions } from '../lib/deployer'
import { loadNetworks } from '../lib/network-loader'
import { deploymentEvents } from '../lib/events'
import { projectOption, dotenvOption, noStdOption, loadDotenv } from './common'

interface RunOptions {
  project: string
  privateKey?: string
  network?: string[]
  dotenv?: string
  std: boolean
}

export function makeRunCommand(): Command {
  const run = new Command('run')
    .description('Run deployment jobs on specified networks')
    .argument('[jobs...]', 'Specific job names to run (and their dependencies). If not provided, all jobs are run.')
    .option('-k, --private-key <key>', 'Signer private key. Can also be set via PRIVATE_KEY env var.')
    .option('-n, --network <chainIds...>', 'One or more network chain IDs to run on. If not provided, runs on all configured networks.')

  projectOption(run)
  dotenvOption(run)
  noStdOption(run)

  run.action(async (jobs: string[], options: RunOptions) => {
    try {
      loadDotenv(options)
      
      const privateKey = options.privateKey || process.env.PRIVATE_KEY
      if (!privateKey) {
        throw new Error('A private key must be provided via the --private-key option or the PRIVATE_KEY environment variable.')
      }

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
        loaderOptions: {
          loadStdTemplates: options.std !== false
        }
      }

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