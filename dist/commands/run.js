"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRunCommand = makeRunCommand;
const commander_1 = require("commander");
const deployer_1 = require("../lib/deployer");
const network_loader_1 = require("../lib/network-loader");
const network_utils_1 = require("../lib/network-utils");
const events_1 = require("../lib/events");
const common_1 = require("./common");
const network_selection_1 = require("../lib/network-selection");
const index_1 = require("../index");
function makeRunCommand() {
    const run = new commander_1.Command('run')
        .description('Run deployment jobs on specified networks')
        .argument('[jobs...]', 'Specific job names or patterns to run (and their dependencies). Supports wildcards like "sequence/*" or "job?". If not provided, all jobs are run.')
        .option('-k, --private-key <key>', 'Signer private key. Can also be set via PRIVATE_KEY env var.')
        .option('-n, --network <selectors>', 'Comma-separated network selectors (by chain ID or name). If not provided, runs on all configured networks.')
        .option('--rpc-url <url>', 'Custom RPC URL to run on. The system will automatically detect chainId and network information. This overrides networks.yaml configuration.')
        .option('--etherscan-api-key <key>', 'Etherscan API key for contract verification. Can also be set via ETHERSCAN_API_KEY env var.')
        .option('--fail-early', 'Stop execution as soon as any job fails. Default: false', false)
        .option('--no-post-check-conditions', 'Skip post-execution check of skip conditions. Default: false (post-check enabled)', false)
        .option('--flat-output', 'Write output files in a single flat directory instead of mirroring the jobs directory structure. Default: false', false)
        .option('--no-summary', 'Hide final summary at the end of the run. Default: show', false)
        .option('--run-deprecated', 'Allow running jobs marked as deprecated. By default deprecated jobs are skipped unless explicitly targeted.', false)
        .option('--ignore-verify-errors', 'Convert verification errors to warnings instead of exiting with error code. Shows complete warning report at the end.', false);
    (0, common_1.projectOption)(run);
    (0, common_1.dotenvOption)(run);
    (0, common_1.noStdOption)(run);
    (0, common_1.verbosityOption)(run);
    run.action(async (jobs, options) => {
        try {
            (0, common_1.loadDotenv)(options);
            (0, index_1.setVerbosity)(options.verbose);
            const privateKey = options.privateKey || process.env.PRIVATE_KEY;
            if (!privateKey && !options.rpcUrl) {
                throw new Error('A private key must be provided via the --private-key option or the PRIVATE_KEY environment variable, or an --rpc-url must be specified to attempt an implicit sender.');
            }
            const etherscanApiKey = options.etherscanApiKey || process.env.ETHERSCAN_API_KEY;
            const projectRoot = options.project;
            let networks = await (0, network_loader_1.loadNetworks)(projectRoot);
            if (options.rpcUrl) {
                if (!(0, network_utils_1.isValidRpcUrl)(options.rpcUrl)) {
                    throw new Error(`Invalid RPC URL format: ${options.rpcUrl}`);
                }
                try {
                    const detectedNetwork = await (0, network_utils_1.detectNetworkFromRpc)(options.rpcUrl);
                    const customNetwork = {
                        name: detectedNetwork.name || `custom-${detectedNetwork.chainId}`,
                        chainId: detectedNetwork.chainId,
                        rpcUrl: options.rpcUrl,
                        supports: detectedNetwork.supports || [],
                        gasLimit: detectedNetwork.gasLimit,
                        testnet: detectedNetwork.testnet
                    };
                    networks = [customNetwork];
                }
                catch (error) {
                    throw new Error(`Failed to detect network from RPC URL "${options.rpcUrl}": ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            if (networks.length === 0 && !options.rpcUrl) {
                throw new Error('No networks configured. Please create a networks.yaml file in your project root or use --rpc-url to specify a custom network.');
            }
            const selectedChainIds = (0, network_selection_1.resolveSelectedChainIds)(options.network, networks);
            const deployerOptions = {
                projectRoot,
                privateKey,
                networks,
                runJobs: jobs.length > 0 ? jobs : undefined,
                runOnNetworks: selectedChainIds,
                etherscanApiKey,
                failEarly: options.failEarly,
                noPostCheckConditions: options.noPostCheckConditions,
                showSummary: options.summary !== false,
                loaderOptions: {
                    loadStdTemplates: options.std !== false
                },
                flatOutput: options.flatOutput === true,
                runDeprecated: options.runDeprecated === true,
                ignoreVerifyErrors: options.ignoreVerifyErrors === true
            };
            const deployer = new deployer_1.Deployer(deployerOptions);
            await deployer.run();
        }
        catch (error) {
            if (!(error instanceof Error && error.message.includes('deployment_failed'))) {
                events_1.deploymentEvents.emitEvent({
                    type: 'cli_error',
                    level: 'error',
                    data: {
                        message: error instanceof Error ? error.message : String(error)
                    }
                });
            }
            process.exit(1);
        }
    });
    return run;
}
//# sourceMappingURL=run.js.map