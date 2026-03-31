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
exports.makeEtherscanCommand = makeEtherscanCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const network_loader_1 = require("../lib/network-loader");
const network_selection_1 = require("../lib/network-selection");
const common_1 = require("./common");
const index_1 = require("../index");
const solc = __importStar(require("solc"));
const crypto_1 = require("crypto");
function getEtherscanApiUrl(chainId) {
    return `https://api.etherscan.io/v2/api?chainid=${chainId}`;
}
async function fetchFromEtherscan(chainId, apiKey, address, action) {
    const apiUrl = getEtherscanApiUrl(chainId);
    const params = new URLSearchParams({
        module: 'contract',
        action,
        apikey: apiKey,
        address
    });
    const resp = await fetch(`${apiUrl}&${params.toString()}`, {
        method: 'GET',
        signal: AbortSignal.timeout(20000)
    });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }
    const data = await resp.json();
    if (data.status !== '1') {
        const msg = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
        throw new Error(msg || 'Unknown Etherscan error');
    }
    if (action === 'getabi') {
        if (typeof data.result !== 'string') {
            throw new Error('Unexpected ABI result format from Etherscan');
        }
        try {
            return JSON.parse(data.result);
        }
        catch (_e) {
            throw new Error('Failed to parse ABI JSON returned by Etherscan');
        }
    }
    if (action === 'getsourcecode') {
        if (!Array.isArray(data.result) || data.result.length === 0) {
            throw new Error('Empty result from Etherscan');
        }
        const first = data.result[0];
        const sourceCodeRaw = first?.SourceCode;
        if (typeof sourceCodeRaw !== 'string' || sourceCodeRaw.length === 0) {
            throw new Error('No SourceCode found on Etherscan');
        }
        const trimmed = sourceCodeRaw.trim();
        const cleaned = trimmed.startsWith('{{') && trimmed.endsWith('}}')
            ? trimmed.slice(1, -1)
            : trimmed;
        try {
            const parsed = JSON.parse(cleaned);
            return { rawResult: first, parsedSource: parsed };
        }
        catch {
            return { rawResult: first, parsedSource: sourceCodeRaw };
        }
    }
    return data.result;
}
function makeEtherscanCommand() {
    const etherscan = new commander_1.Command('etherscan')
        .description('Etherscan helper commands (ABI/source fetch)');
    const withCommon = (cmd) => {
        (0, common_1.projectOption)(cmd);
        (0, common_1.verbosityOption)(cmd);
        cmd
            .option('--etherscan-api-key <key>', 'Etherscan API key. Can also be set via ETHERSCAN_API_KEY env var.')
            .option('-n, --network <selector>', 'Target network (chain ID or name). When a name matches multiple networks, the first match is used.')
            .option('-a, --address <address>', 'Contract address to query', '')
            .option('--raw', 'Print raw response (no pretty JSON). Useful for piping.', false);
        return cmd;
    };
    const abi = new commander_1.Command('abi')
        .description('Fetch contract ABI from Etherscan and print to stdout');
    withCommon(abi);
    abi.action(async (options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const apiKey = options.etherscanApiKey || process.env.ETHERSCAN_API_KEY;
            if (!apiKey) {
                console.error(chalk_1.default.red('Etherscan API key is required. Use --etherscan-api-key or set ETHERSCAN_API_KEY.'));
                process.exit(1);
            }
            if (!options.address) {
                console.error(chalk_1.default.red('Missing required --address option'));
                process.exit(1);
            }
            let chainId;
            const networks = await (0, network_loader_1.loadNetworks)(options.project);
            if (options.network) {
                chainId = (0, network_selection_1.resolveSingleChainId)(options.network, networks);
            }
            else if (networks.length === 1) {
                chainId = networks[0].chainId;
            }
            if (!chainId) {
                console.error(chalk_1.default.red('Please provide --network <selector>. When multiple networks are configured, selection is required.'));
                process.exit(1);
            }
            const result = await fetchFromEtherscan(chainId, apiKey, options.address, 'getabi');
            if (options.raw) {
                process.stdout.write(JSON.stringify(result));
            }
            else {
                console.log(JSON.stringify(result, null, 2));
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('Error fetching ABI from Etherscan:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    const source = new commander_1.Command('source')
        .description('Fetch contract source and emit a self-contained build-info JSON suitable for verification');
    withCommon(source);
    source.action(async (options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const apiKey = options.etherscanApiKey || process.env.ETHERSCAN_API_KEY;
            if (!apiKey) {
                console.error(chalk_1.default.red('Etherscan API key is required. Use --etherscan-api-key or set ETHERSCAN_API_KEY.'));
                process.exit(1);
            }
            if (!options.address) {
                console.error(chalk_1.default.red('Missing required --address option'));
                process.exit(1);
            }
            let chainId;
            const networks2 = await (0, network_loader_1.loadNetworks)(options.project);
            if (options.network) {
                chainId = (0, network_selection_1.resolveSingleChainId)(options.network, networks2);
            }
            else if (networks2.length === 1) {
                chainId = networks2[0].chainId;
            }
            if (!chainId) {
                console.error(chalk_1.default.red('Please provide --network <selector>. When multiple networks are configured, selection is required.'));
                process.exit(1);
            }
            const result = await fetchFromEtherscan(chainId, apiKey, options.address, 'getsourcecode');
            const raw = result.rawResult;
            const parsed = result.parsedSource;
            const compilerVersion = raw?.CompilerVersion || '';
            const optimizationUsed = raw?.OptimizationUsed || '';
            const runsStr = raw?.Runs || '';
            const evmVersionRaw = raw?.EVMVersion || '';
            const isStandardJson = !!(parsed && typeof parsed === 'object' && 'language' in parsed && 'sources' in parsed);
            let input;
            if (isStandardJson) {
                input = parsed;
                const currentSel = (input.settings?.outputSelection ?? {});
                const mergedSel = {
                    '*': {
                        '*': Array.from(new Set([
                            ...((currentSel?.['*']?.['*']) || []),
                            'abi',
                            'evm.bytecode',
                            'evm.deployedBytecode',
                            'metadata',
                            'userdoc',
                            'devdoc',
                            'evm.methodIdentifiers'
                        ]))
                    }
                };
                input.settings = {
                    ...(input.settings || {}),
                    outputSelection: mergedSel
                };
            }
            else {
                const flattened = String(parsed || '');
                input = {
                    language: 'Solidity',
                    sources: {
                        'Flattened.sol': { content: flattened }
                    },
                    settings: {
                        optimizer: {
                            enabled: optimizationUsed === '1',
                            runs: Number.isFinite(Number(runsStr)) ? Number(runsStr) : 200
                        },
                        evmVersion: evmVersionRaw && evmVersionRaw !== 'default' ? evmVersionRaw : undefined,
                        outputSelection: {
                            '*': {
                                '*': [
                                    'abi',
                                    'evm.bytecode.object',
                                    'evm.bytecode.sourceMap',
                                    'evm.bytecode.linkReferences',
                                    'evm.deployedBytecode.object',
                                    'evm.deployedBytecode.sourceMap',
                                    'evm.deployedBytecode.linkReferences',
                                    'evm.deployedBytecode.immutableReferences',
                                    'evm.methodIdentifiers',
                                    'metadata'
                                ]
                            }
                        }
                    }
                };
            }
            const solcInput = JSON.stringify(input);
            const versionTag = compilerVersion && compilerVersion.startsWith('v') ? compilerVersion : (compilerVersion ? `v${compilerVersion}` : '');
            let outputRaw;
            if (versionTag) {
                outputRaw = await new Promise((resolve, reject) => {
                    solc.loadRemoteVersion(versionTag, (err, specificSolc) => {
                        if (err || !specificSolc)
                            return reject(err || new Error('Failed to load solc version'));
                        try {
                            resolve(specificSolc.compile(solcInput));
                        }
                        catch (e) {
                            reject(e);
                        }
                    });
                });
            }
            else {
                outputRaw = solc.compile(solcInput);
            }
            const output = JSON.parse(outputRaw);
            const id = (0, crypto_1.createHash)('sha1').update(solcInput).digest('hex');
            const solcLongVersion = output?.compiler?.version || (compilerVersion ? compilerVersion.replace(/^v/, '') : undefined);
            const solcMaybe = solc;
            const solcVersion = (solcLongVersion || '').split('+')[0] || (typeof solcMaybe.version === 'function' ? solcMaybe.version() : 'unknown');
            const basePath = process.cwd();
            const includePaths = [basePath];
            const allowPaths = includePaths;
            const buildInfo = {
                id,
                source_id_to_path: Object.fromEntries(Object.keys(input.sources).map((p, i) => [String(i), p])),
                language: input.language,
                _format: 'ethers-rs-sol-build-info-1',
                input: {
                    version: solcVersion,
                    language: input.language,
                    sources: input.sources,
                    settings: input.settings,
                    evmVersion: input.settings?.evmVersion || 'cancun',
                    viaIR: input.settings?.viaIR || false,
                    libraries: input.settings?.libraries || {}
                },
                allowPaths,
                basePath,
                includePaths,
                output: {
                    contracts: output.contracts || {},
                    sources: output.sources || {}
                },
                solcLongVersion: solcLongVersion || solcVersion,
                solcVersion: solcVersion
            };
            console.log(options.raw ? JSON.stringify(buildInfo) : JSON.stringify(buildInfo, null, 2));
        }
        catch (error) {
            console.error(chalk_1.default.red('Error fetching source from Etherscan:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    etherscan.addCommand(abi);
    etherscan.addCommand(source);
    return etherscan;
}
//# sourceMappingURL=etherscan.js.map