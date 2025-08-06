import { Command } from 'commander'
import { Deployer, DeployerOptions } from '../lib/deployer'
import { loadNetworks } from '../lib/network-loader'
import { detectNetworkFromRpc, isValidRpcUrl } from '../lib/network-utils'
import { deploymentEvents } from '../lib/events'
import { Network } from '../lib/types'
import { projectOption, dotenvOption, noStdOption, verbosityOption, loadDotenv } from './common'
import { setVerbosity } from '../index'

interface RunOptions {
  project: string
  privateKey?: string
  network?: string[]
  rpcUrl?: string
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
    .option('--rpc-url <url>', 'Custom RPC URL to run on. The system will automatically detect chainId and network information. This overrides networks.yaml configuration.')
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
      
      let privateKey: string | undefined = options.privateKey || process.env.PRIVATE_KEY
      if (!privateKey && !options.rpcUrl) {
        throw new Error('A private key must be provided via the --private-key option or the PRIVATE_KEY environment variable, or an --rpc-url must be specified to attempt an implicit sender.')
      }

      const etherscanApiKey = options.etherscanApiKey || process.env.ETHERSCAN_API_KEY

      const projectRoot = options.project
      
      // Load networks from YAML file
      let networks = await loadNetworks(projectRoot)
      
      // Handle custom RPC URL if provided
      if (options.rpcUrl) {
        console.log(`[DEBUG] Custom RPC URL provided: ${options.rpcUrl}`)
        
        // Validate RPC URL format
        if (!isValidRpcUrl(options.rpcUrl)) {
          throw new Error(`Invalid RPC URL format: ${options.rpcUrl}`)
        }
        
        try {
          // Detect network information from RPC URL
          const detectedNetwork = await detectNetworkFromRpc(options.rpcUrl)
          
          // Create a complete network object
          const customNetwork: Network = {
            name: detectedNetwork.name || `custom-${detectedNetwork.chainId}`,
            chainId: detectedNetwork.chainId!,
            rpcUrl: options.rpcUrl,
            // Optional fields with defaults
            supports: detectedNetwork.supports || [],
            gasLimit: detectedNetwork.gasLimit,
            testnet: detectedNetwork.testnet
          }
          
          console.log(`[DEBUG] Created custom network:`, customNetwork)
          
          // Replace networks array with just the custom network
          networks = [customNetwork]
        } catch (error) {
          throw new Error(`Failed to detect network from RPC URL "${options.rpcUrl}": ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (networks.length === 0 && !options.rpcUrl) {
        throw new Error('No networks configured. Please create a networks.yaml file in your project root or use --rpc-url to specify a custom network.')
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