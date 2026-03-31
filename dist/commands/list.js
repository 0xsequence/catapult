"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeListCommand = makeListCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const path = __importStar(require("path"));
const common_1 = require("./common");
const network_loader_1 = require("../lib/network-loader");
const index_1 = require("../index");
function makeListCommand() {
    const list = new commander_1.Command('list')
        .description('List project resources like jobs, contracts, and networks');
    const listJobs = new commander_1.Command('jobs')
        .description('List all available jobs in the project');
    (0, common_1.projectOption)(listJobs);
    (0, common_1.noStdOption)(listJobs);
    (0, common_1.verbosityOption)(listJobs);
    listJobs.action(async (options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const loader = await (0, common_1.loadProject)(options.project, {
                loadStdTemplates: options.std !== false
            });
            console.log(chalk_1.default.bold.underline('Available Jobs:'));
            if (loader.jobs.size === 0) {
                console.log(chalk_1.default.yellow('No jobs found in this project.'));
                return;
            }
            for (const job of loader.jobs.values()) {
                const deprecatedMark = job.deprecated ? ` ${chalk_1.default.yellow('(deprecated)')}` : '';
                console.log(`- ${chalk_1.default.cyan(job.name)} (v${job.version})${deprecatedMark}`);
                if (job.description) {
                    console.log(`  ${chalk_1.default.gray(job.description)}`);
                }
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('Error listing jobs:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    const listContracts = new commander_1.Command('contracts')
        .description('List all contracts found in the project');
    (0, common_1.projectOption)(listContracts);
    (0, common_1.noStdOption)(listContracts);
    (0, common_1.verbosityOption)(listContracts);
    listContracts.action(async (options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const loader = await (0, common_1.loadProject)(options.project, {
                loadStdTemplates: options.std !== false
            });
            const contracts = loader.contractRepository.getAll();
            const ambiguousRefs = loader.contractRepository.getAmbiguousReferences();
            console.log(chalk_1.default.bold.underline('Available Contracts:'));
            if (contracts.length === 0) {
                console.log(chalk_1.default.yellow('No contracts found in this project.'));
            }
            else {
                for (const contract of contracts) {
                    const name = contract.contractName || 'Unknown';
                    const source = contract.sourceName || 'Unknown';
                    console.log(`- ${chalk_1.default.cyan(name)} (${source})`);
                    console.log(`  ${chalk_1.default.gray('Unique Hash:')} ${contract.uniqueHash}`);
                    if (contract.buildInfoId) {
                        console.log(`  ${chalk_1.default.gray('Build Info ID:')} ${contract.buildInfoId}`);
                    }
                    console.log(`  ${chalk_1.default.gray('Sources:')} ${Array.from(contract._sources).map(p => path.relative(options.project, p)).join(', ')}`);
                }
            }
            if (ambiguousRefs.length > 0) {
                console.log('\n' + chalk_1.default.bold.underline(chalk_1.default.yellow('Ambiguous References:')));
                console.log(chalk_1.default.yellow('The following references point to multiple contracts:'));
                for (const ref of ambiguousRefs) {
                    console.log(`- ${chalk_1.default.red(ref)}`);
                }
                console.log(chalk_1.default.yellow('Use the unique hash or a more specific path to reference these contracts.'));
            }
            if (contracts.length === 0) {
                console.log('\n' + chalk_1.default.yellow('No contracts found in this project. Make sure you have artifact files or build-info files in your project.'));
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('Error listing contracts:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    const listTemplates = new commander_1.Command('templates')
        .description('List all available templates');
    (0, common_1.projectOption)(listTemplates);
    (0, common_1.noStdOption)(listTemplates);
    (0, common_1.verbosityOption)(listTemplates);
    listTemplates.action(async (options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const loader = await (0, common_1.loadProject)(options.project, {
                loadStdTemplates: options.std !== false
            });
            console.log(chalk_1.default.bold.underline('Available Templates:'));
            if (loader.templates.size === 0) {
                console.log(chalk_1.default.yellow('No templates found.'));
                return;
            }
            for (const template of loader.templates.values()) {
                console.log(`- ${chalk_1.default.cyan(template.name)}`);
                if (template.description) {
                    console.log(`  ${chalk_1.default.gray(template.description)}`);
                }
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('Error listing templates:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    const listNetworks = new commander_1.Command('networks')
        .description('List all configured networks');
    (0, common_1.projectOption)(listNetworks);
    (0, common_1.verbosityOption)(listNetworks);
    listNetworks.option('--only-testnets', 'Show only test networks');
    listNetworks.option('--only-non-testnets', 'Show only non-test networks');
    listNetworks.option('--simple', 'Output only network names, one per line');
    listNetworks.option('--simple-chain-ids', 'Output only chain IDs, one per line');
    listNetworks.action(async (options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const networks = await (0, network_loader_1.loadNetworks)(options.project);
            let filteredNetworks = networks;
            if (options.onlyTestnets) {
                filteredNetworks = networks.filter(network => network.testnet === true);
            }
            else if (options.onlyNonTestnets) {
                filteredNetworks = networks.filter(network => network.testnet !== true);
            }
            if (options.simple) {
                if (filteredNetworks.length === 0) {
                    console.log('');
                    return;
                }
                console.log(filteredNetworks.map(network => network.name).join('\n'));
                return;
            }
            if (options.simpleChainIds) {
                if (filteredNetworks.length === 0) {
                    console.log('');
                    return;
                }
                console.log(filteredNetworks.map(network => network.chainId.toString()).join('\n'));
                return;
            }
            console.log(chalk_1.default.bold.underline('Available Networks:'));
            if (filteredNetworks.length === 0) {
                if (options.onlyTestnets) {
                    console.log(chalk_1.default.yellow('No test networks configured.'));
                }
                else if (options.onlyNonTestnets) {
                    console.log(chalk_1.default.yellow('No non-test networks configured.'));
                }
                else {
                    console.log(chalk_1.default.yellow('No networks configured. Create a networks.yaml file in your project root.'));
                }
                return;
            }
            for (const network of filteredNetworks) {
                const testnetIndicator = network.testnet ? chalk_1.default.green('(testnet)') : '';
                console.log(`- ${chalk_1.default.cyan(network.name)} (Chain ID: ${network.chainId}) ${testnetIndicator}`);
                console.log(`  ${chalk_1.default.gray(`RPC: ${network.rpcUrl}`)}`);
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('Error listing networks:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    const listConstants = new commander_1.Command('constants')
        .description('List constants defined at top-level and per job');
    (0, common_1.projectOption)(listConstants);
    (0, common_1.noStdOption)(listConstants);
    (0, common_1.verbosityOption)(listConstants);
    listConstants.action(async (options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const loader = await (0, common_1.loadProject)(options.project, {
                loadStdTemplates: options.std !== false
            });
            console.log(chalk_1.default.bold.underline('Top-level Constants:'));
            if (loader.constants.size === 0) {
                console.log(chalk_1.default.yellow('No top-level constants found.'));
            }
            else {
                for (const [key, value] of loader.constants.entries()) {
                    console.log(`- ${chalk_1.default.cyan(key)}${options.verbose ? ` = ${JSON.stringify(value)}` : ''}`);
                }
            }
            console.log(chalk_1.default.bold.underline('\nJob-level Constants:'));
            let anyJobConstants = false;
            for (const job of loader.jobs.values()) {
                const constants = job.constants;
                if (constants && Object.keys(constants).length > 0) {
                    anyJobConstants = true;
                    console.log(`- ${chalk_1.default.cyan(job.name)}:`);
                    for (const key of Object.keys(constants)) {
                        console.log(`  • ${key}${options.verbose ? ` = ${JSON.stringify(constants[key])}` : ''}`);
                    }
                }
            }
            if (!anyJobConstants) {
                console.log(chalk_1.default.yellow('No job-level constants found.'));
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('Error listing constants:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    list.addCommand(listJobs);
    list.addCommand(listContracts);
    list.addCommand(listTemplates);
    list.addCommand(listNetworks);
    list.addCommand(listConstants);
    return list;
}
//# sourceMappingURL=list.js.map