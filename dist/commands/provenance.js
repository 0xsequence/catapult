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
exports.makeProvenanceCommand = makeProvenanceCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const path = __importStar(require("path"));
const common_1 = require("./common");
const index_1 = require("../index");
const provenance_1 = require("../lib/provenance");
function makeProvenanceCommand() {
    const provenance = new commander_1.Command('provenance')
        .description('Work with build-info source provenance');
    const verify = new commander_1.Command('verify')
        .description('Verify committed build-info files against source provenance')
        .argument('[jobs...]', 'Optional job names or patterns to verify. Without jobs, verifies all provenance in the project.')
        .option('--include-dependencies', 'When jobs are provided, include their dependency jobs too.', false);
    (0, common_1.projectOption)(verify);
    (0, common_1.noStdOption)(verify);
    (0, common_1.verbosityOption)(verify);
    verify.action(async (jobs, options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const result = await (0, provenance_1.verifySourceProvenance)(options.project, {
                jobs,
                includeDependencies: options.includeDependencies === true,
                loadStdTemplates: options.std !== false
            });
            printRunResult('verify', options.project, result);
            exitIfFailed(result);
        }
        catch (error) {
            console.error(chalk_1.default.red('Error verifying provenance:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    const generate = new commander_1.Command('generate')
        .description('Generate missing build-info files from source provenance')
        .argument('[jobs...]', 'Optional job names or patterns to generate. Without jobs, generates for all provenance in the project.')
        .option('--include-dependencies', 'When jobs are provided, include their dependency jobs too.', false)
        .option('--force', 'Overwrite existing build-info files.', false);
    (0, common_1.projectOption)(generate);
    (0, common_1.noStdOption)(generate);
    (0, common_1.verbosityOption)(generate);
    generate.action(async (jobs, options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            const result = await (0, provenance_1.generateBuildInfoFromSourceProvenance)(options.project, {
                jobs,
                includeDependencies: options.includeDependencies === true,
                loadStdTemplates: options.std !== false,
                force: options.force === true
            });
            printRunResult('generate', options.project, result);
            exitIfFailed(result);
        }
        catch (error) {
            console.error(chalk_1.default.red('Error generating build-info from provenance:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    provenance.addCommand(verify);
    provenance.addCommand(generate);
    return provenance;
}
function printRunResult(command, projectRoot, result) {
    for (const warning of result.warnings) {
        console.warn(chalk_1.default.yellow(warning));
    }
    if (result.entries.length === 0) {
        console.log(chalk_1.default.yellow('No source provenance entries found.'));
        return;
    }
    for (const item of result.results) {
        printOperationResult(projectRoot, item);
    }
    const failed = result.results.filter(item => item.status === 'failed').length;
    const skipped = result.results.filter(item => item.status === 'skipped').length;
    const completed = result.results.length - failed - skipped;
    const verb = command === 'verify' ? 'verified' : 'generated';
    if (failed > 0) {
        console.log(chalk_1.default.red(`Provenance ${command} completed with ${failed} failure(s), ${completed} ${verb}, ${skipped} skipped.`));
    }
    else {
        console.log(chalk_1.default.green(`Provenance ${command} completed: ${completed} ${verb}, ${skipped} skipped.`));
    }
}
function printOperationResult(projectRoot, result) {
    const target = path.relative(projectRoot, result.entry.buildInfoPath);
    const source = path.relative(projectRoot, result.entry.sourceDocumentPath);
    const prefix = result.status === 'failed'
        ? chalk_1.default.red('failed')
        : result.status === 'skipped'
            ? chalk_1.default.yellow('skipped')
            : chalk_1.default.green(result.status);
    console.log(`${prefix} ${target} ${chalk_1.default.gray(`[${source}]`)} - ${result.message}`);
}
function exitIfFailed(result) {
    if (result.results.some(item => item.status === 'failed')) {
        process.exit(1);
    }
}
//# sourceMappingURL=provenance.js.map