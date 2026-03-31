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
exports.makeUtilsCommand = makeUtilsCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const common_1 = require("./common");
const network_loader_1 = require("../lib/network-loader");
const index_1 = require("../index");
function makeUtilsCommand() {
    const utils = new commander_1.Command('utils')
        .description('Utility commands for project management');
    const chainIdToName = new commander_1.Command('chain-id-to-name')
        .description('Convert a chain ID to network name');
    (0, common_1.projectOption)(chainIdToName);
    (0, common_1.verbosityOption)(chainIdToName);
    chainIdToName.argument('<chain-id>', 'The chain ID to convert');
    chainIdToName.action(async (chainId, options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const chainIdNumber = parseInt(chainId, 10);
            if (isNaN(chainIdNumber)) {
                console.error(chalk_1.default.red('Invalid chain ID. Please provide a valid number.'));
                process.exit(1);
            }
            const networks = await (0, network_loader_1.loadNetworks)(options.project);
            const network = networks.find(n => n.chainId === chainIdNumber);
            if (network) {
                console.log(network.name);
            }
            else {
                console.error(chalk_1.default.red(`No network found with chain ID ${chainIdNumber}`));
                process.exit(1);
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('Error converting chain ID to network name:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    utils.addCommand(chainIdToName);
    const genTable = new commander_1.Command('gen-table')
        .description('Generate a consolidated addresses table from an output directory')
        .argument('<output-dir>', 'Directory containing job output JSON files (searches recursively)')
        .option('--name', 'Include Name column', true)
        .option('--key', 'Include Key column', false)
        .option('--file', 'Include File column', false)
        .option('--chain-ids, --chainIds', 'Include ChainIds column', false)
        .option('--job', 'Include Job column', true)
        .option('--address', 'Include Address column', true)
        .option('--format <format>', "Output format: 'markdown' or 'ascii' (default)", 'ascii')
        .action(async (outputDir, options) => {
        try {
            const absoluteDir = path.resolve(outputDir);
            if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
                console.error(chalk_1.default.red(`Output directory not found or not a directory: ${absoluteDir}`));
                process.exit(1);
            }
            const jsonFiles = [];
            const walk = (dir) => {
                for (const entry of fs.readdirSync(dir)) {
                    const full = path.join(dir, entry);
                    const stat = fs.statSync(full);
                    if (stat.isDirectory())
                        walk(full);
                    else if (stat.isFile() && entry.toLowerCase().endsWith('.json'))
                        jsonFiles.push(full);
                }
            };
            walk(absoluteDir);
            const rows = [];
            const addressRegex = /^0x[a-fA-F0-9]{40}$/;
            const toTitleCase = (slug) => slug.split(/[-_\s]+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
            const extractVersionSuffix = (jobName) => {
                const m = jobName.match(/[-_]?v(\d+)/i);
                return m ? `V${m[1]}` : '';
            };
            const deriveName = (jobName, key) => {
                const version = extractVersionSuffix(jobName);
                const baseJob = jobName.replace(/[-_]?v\d+$/i, '');
                const keyCore = key.replace(/\.address$/i, '');
                const isGeneric = /^(factory|address)$/i.test(keyCore);
                const nameCore = isGeneric ? `${toTitleCase(baseJob)} ${toTitleCase(keyCore)}` : toTitleCase(keyCore);
                return `${nameCore.replace(/\s+/g, '')}${version}`;
            };
            for (const file of jsonFiles) {
                try {
                    const raw = fs.readFileSync(file, 'utf8');
                    const data = JSON.parse(raw);
                    if (!data || typeof data !== 'object' || !Array.isArray(data.networks))
                        continue;
                    const jobName = data.jobName ?? path.basename(file, '.json');
                    for (const net of data.networks) {
                        if (!net || typeof net !== 'object')
                            continue;
                        const outputs = net.outputs;
                        if (!outputs)
                            continue;
                        const chainIds = Array.isArray(net.chainIds) ? net.chainIds : [];
                        for (const [key, value] of Object.entries(outputs)) {
                            let address;
                            if (typeof value === 'string' && addressRegex.test(value)) {
                                address = value;
                            }
                            else if (value && typeof value === 'object' && 'address' in value && typeof value.address === 'string' && addressRegex.test(value.address)) {
                                address = value.address;
                            }
                            if (!address)
                                continue;
                            rows.push({
                                job: jobName,
                                chainIds: chainIds.join(','),
                                name: deriveName(jobName, key),
                                address,
                                key,
                                file
                            });
                        }
                    }
                }
                catch {
                }
            }
            rows.sort((a, b) => a.job.localeCompare(b.job) || a.name.localeCompare(b.name));
            if (rows.length === 0) {
                console.log(chalk_1.default.yellow('No address entries found.'));
                return;
            }
            const showJob = !!options.job;
            const showAddress = !!options.address;
            const showName = !!options.name;
            const showKey = !!options.key;
            const showChainIds = !!options.chainIds;
            const showFile = !!options.file;
            const selectedHeaders = [];
            if (showJob)
                selectedHeaders.push('job');
            if (showChainIds)
                selectedHeaders.push('chainIds');
            if (showName)
                selectedHeaders.push('name');
            if (showAddress)
                selectedHeaders.push('address');
            if (showKey)
                selectedHeaders.push('key');
            if (showFile)
                selectedHeaders.push('file');
            const titles = {
                job: 'Job',
                chainIds: 'ChainIds',
                name: 'Name',
                address: 'Address',
                key: 'Key',
                file: 'File'
            };
            const format = String(options.format || 'markdown').toLowerCase();
            if (format !== 'markdown' && format !== 'ascii') {
                console.error(chalk_1.default.red("Invalid format. Use 'markdown' or 'ascii'."));
                process.exit(1);
            }
            if (format === 'markdown') {
                const header = '| ' + selectedHeaders.map(h => titles[h]).join(' | ') + ' |';
                const sepMd = '| ' + selectedHeaders.map(h => '-'.repeat(Math.max(3, String(titles[h]).length))).join(' | ') + ' |';
                console.log(header);
                console.log(sepMd);
                for (const r of rows) {
                    console.log('| ' + selectedHeaders.map(h => String(r[h])).join(' | ') + ' |');
                }
            }
            else {
                const widths = {};
                for (const h of selectedHeaders) {
                    widths[h] = Math.max(titles[h].length, ...rows.map(r => String(r[h]).length));
                }
                const makeSep = (left, mid, right, fill) => {
                    return left + selectedHeaders.map(h => fill.repeat(widths[h] + 2)).join(mid) + right;
                };
                const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
                const top = makeSep('┌', '┬', '┐', '─');
                const sep = makeSep('├', '┼', '┤', '─');
                const bot = makeSep('└', '┴', '┘', '─');
                const headerLine = '│' + selectedHeaders.map(h => ' ' + pad(titles[h], widths[h]) + ' ').join('│') + '│';
                const lines = rows.map(r => '│' + selectedHeaders.map(h => ' ' + pad(String(r[h]), widths[h]) + ' ').join('│') + '│');
                console.log(top);
                console.log(headerLine);
                console.log(sep);
                for (const line of lines)
                    console.log(line);
                console.log(bot);
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('Error generating table:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    utils.addCommand(genTable);
    return utils;
}
//# sourceMappingURL=utils.js.map