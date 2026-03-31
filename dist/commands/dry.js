"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeDryRunCommand = makeDryRunCommand;
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const common_1 = require("./common");
const network_loader_1 = require("../lib/network-loader");
const graph_1 = require("../lib/core/graph");
const common_2 = require("./common");
const contract_references_1 = require("../lib/validation/contract-references");
const index_1 = require("../index");
const network_selection_1 = require("../lib/network-selection");
function extractConstantRefs(value, refs, templateCtx) {
    if (typeof value === 'string') {
        const m = value.match(/^{{(.*)}}$/);
        if (m) {
            const expr = m[1].trim();
            if (expr.includes('.') || expr.includes('(') || expr.includes(')'))
                return;
            if (templateCtx?.arguments && Object.prototype.hasOwnProperty.call(templateCtx.arguments, expr)) {
                return;
            }
            refs.push(expr);
        }
    }
    else if (Array.isArray(value)) {
        for (const v of value)
            extractConstantRefs(v, refs, templateCtx);
    }
    else if (value && typeof value === 'object') {
        for (const v of Object.values(value))
            extractConstantRefs(v, refs, templateCtx);
    }
}
function makeDryRunCommand() {
    const dryRun = new commander_1.Command('dry-run')
        .description('Validate project configuration and show execution plan without running transactions')
        .argument('[jobs...]', 'Specific job names to validate (and their dependencies).')
        .option('-n, --network <selectors>', 'Comma-separated network selectors (by chain ID or name).');
    (0, common_2.projectOption)(dryRun);
    (0, common_2.noStdOption)(dryRun);
    (0, common_2.verbosityOption)(dryRun);
    dryRun.action(async (jobs, options) => {
        try {
            (0, index_1.setVerbosity)(options.verbose);
            console.log(chalk_1.default.bold.inverse(' DRY-RUN MODE '));
            const projectRoot = options.project;
            const loader = await (0, common_1.loadProject)(projectRoot, {
                loadStdTemplates: options.std !== false
            });
            const allNetworks = await (0, network_loader_1.loadNetworks)(projectRoot);
            console.log(chalk_1.default.blue('\nBuilding dependency graph...'));
            const graph = new graph_1.DependencyGraph(loader.jobs, loader.templates);
            const fullOrder = graph.getExecutionOrder();
            console.log(chalk_1.default.green('   - Dependency graph built successfully.'));
            console.log(chalk_1.default.blue('\nContract Repository:'));
            console.log(chalk_1.default.green(`   - Found ${loader.contractRepository.getAll().length} unique contracts.`));
            const usedRefs = await (0, contract_references_1.extractUsedContractReferences)(loader);
            const allAmbiguousRefs = loader.contractRepository.getAmbiguousReferences();
            const usedRefNames = usedRefs.map(ref => ref.reference);
            const usedAmbiguousRefs = allAmbiguousRefs.filter(ref => usedRefNames.includes(ref));
            if (usedAmbiguousRefs.length > 0) {
                console.log(chalk_1.default.red('\n   - Found ambiguous contract references being used:'));
                for (const ref of usedAmbiguousRefs) {
                    console.log(chalk_1.default.red(`     ✗ "${ref}" could refer to multiple contracts`));
                }
                throw new Error(`Found ${usedAmbiguousRefs.length} ambiguous contract reference(s) being used. Please use more specific references to resolve ambiguity.`);
            }
            console.log(chalk_1.default.green('   - All used contract references are unambiguous.'));
            console.log(chalk_1.default.blue('\nValidating contract references...'));
            const missingRefs = await (0, contract_references_1.validateContractReferences)(loader);
            if (missingRefs.length > 0) {
                console.log(chalk_1.default.red('\n   - Found missing contract references:'));
                for (const ref of missingRefs) {
                    console.log(chalk_1.default.red(`     ✗ ${ref.reference} in ${ref.location}`));
                }
                throw new Error(`Found ${missingRefs.length} missing contract reference(s). Please ensure all referenced contracts exist.`);
            }
            console.log(chalk_1.default.green('   - All contract references are valid.'));
            console.log(chalk_1.default.blue('\nValidating constant references...'));
            const topLevelConstants = loader.constants;
            const missingConstantRefs = [];
            for (const [jobName, job] of loader.jobs.entries()) {
                for (let i = 0; i < job.actions.length; i++) {
                    const action = job.actions[i];
                    const refs = [];
                    extractConstantRefs(action.arguments, refs);
                    const jobConstants = job.constants || {};
                    for (const r of refs) {
                        if (!(r in jobConstants) && !topLevelConstants.has(r)) {
                            missingConstantRefs.push({ ref: r, location: `job '${jobName}', action ${i + 1}${action.name ? ` '${action.name}'` : ''}` });
                        }
                    }
                }
            }
            for (const [templateName, template] of loader.templates.entries()) {
                for (let i = 0; i < template.actions.length; i++) {
                    const action = template.actions[i];
                    const refs = [];
                    extractConstantRefs(action.arguments, refs, template);
                    for (const r of refs) {
                        if (!topLevelConstants.has(r)) {
                            missingConstantRefs.push({ ref: r, location: `template '${templateName}', action ${i + 1}${action.name ? ` '${action.name}'` : ''}` });
                        }
                    }
                }
                if (template.setup?.actions) {
                    for (let i = 0; i < (template.setup.actions?.length || 0); i++) {
                        const action = template.setup.actions[i];
                        const refs = [];
                        extractConstantRefs(action.arguments, refs, template);
                        for (const r of refs) {
                            if (!topLevelConstants.has(r)) {
                                missingConstantRefs.push({ ref: r, location: `template '${templateName}' setup, action ${i + 1}${action.name ? ` '${action.name}'` : ''}` });
                            }
                        }
                    }
                }
                if (template.outputs) {
                    const refs = [];
                    extractConstantRefs(template.outputs, refs, template);
                    for (const r of refs) {
                        if (!topLevelConstants.has(r)) {
                            missingConstantRefs.push({ ref: r, location: `template '${templateName}' outputs` });
                        }
                    }
                }
            }
            if (missingConstantRefs.length > 0) {
                console.log(chalk_1.default.red('\n   - Found missing constant references:'));
                for (const m of missingConstantRefs) {
                    console.log(chalk_1.default.red(`     ✗ ${m.ref} in ${m.location}`));
                }
                throw new Error(`Found ${missingConstantRefs.length} missing constant reference(s). Ensure they are defined at top-level or in the job's constants.`);
            }
            console.log(chalk_1.default.green('   - All constant references are valid.'));
            const runJobs = jobs.length > 0 ? jobs : undefined;
            const runOnNetworks = (0, network_selection_1.resolveSelectedChainIds)(options.network, allNetworks);
            const jobsToRun = new Set();
            if (runJobs) {
                for (const jobName of runJobs) {
                    if (!loader.jobs.has(jobName)) {
                        throw new Error(`Specified job "${jobName}" not found in project.`);
                    }
                    jobsToRun.add(jobName);
                    graph.getDependencies(jobName).forEach(dep => jobsToRun.add(dep));
                }
            }
            else {
                fullOrder.forEach(j => jobsToRun.add(j));
            }
            const jobExecutionPlan = fullOrder.filter(jobName => jobsToRun.has(jobName));
            const targetNetworks = runOnNetworks
                ? allNetworks.filter(n => runOnNetworks.includes(n.chainId))
                : allNetworks;
            console.log(chalk_1.default.blue('\nExecution Plan:'));
            console.log(chalk_1.default.gray(`   - Target Networks: ${targetNetworks.map(n => `${n.name} (ChainID: ${n.chainId})`).join(', ')}`));
            console.log(chalk_1.default.gray(`   - Job Execution Order: ${jobExecutionPlan.join(' -> ')}`));
            console.log(chalk_1.default.green.bold('\n✅ Dry run successful. All job and template definitions appear to be valid.'));
        }
        catch (error) {
            console.error(chalk_1.default.red.bold('\n💥 DRY RUN FAILED!'));
            console.error(chalk_1.default.red(error instanceof Error ? error.message : String(error)));
            process.exit(1);
        }
    });
    return dryRun;
}
//# sourceMappingURL=dry.js.map