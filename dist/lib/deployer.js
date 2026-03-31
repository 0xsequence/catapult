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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deployer = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const loader_1 = require("./core/loader");
const graph_1 = require("./core/graph");
const engine_1 = require("./core/engine");
const etherscan_1 = require("./verification/etherscan");
const context_1 = require("./core/context");
const events_1 = require("./events");
class Deployer {
    constructor(options) {
        this.results = new Map();
        this.options = options;
        this.events = options.eventEmitter || events_1.deploymentEvents;
        this.loader = new loader_1.ProjectLoader(options.projectRoot, options.loaderOptions);
        this.noPostCheckConditions = options.noPostCheckConditions ?? false;
        this.showSummary = options.showSummary !== false;
    }
    async run() {
        this.events.emitEvent({
            type: 'deployment_started',
            level: 'info',
            data: {
                projectRoot: this.options.projectRoot
            }
        });
        try {
            this.events.emitEvent({
                type: 'project_loading_started',
                level: 'info',
                data: {
                    projectRoot: this.options.projectRoot
                }
            });
            await this.loader.load();
            this.events.emitEvent({
                type: 'project_loaded',
                level: 'info',
                data: {
                    jobCount: this.loader.jobs.size,
                    templateCount: this.loader.templates.size
                }
            });
            const graph = new graph_1.DependencyGraph(this.loader.jobs, this.loader.templates);
            this.graph = graph;
            const jobOrder = graph.getExecutionOrder();
            const jobsToRun = this.getJobExecutionPlan(jobOrder);
            if (!this.options.runDeprecated) {
                const skippedDeprecated = jobOrder.filter(name => {
                    const j = this.loader.jobs.get(name);
                    return !jobsToRun.includes(name) && j?.deprecated === true;
                });
                if (skippedDeprecated.length > 0) {
                    this.events.emitEvent({
                        type: 'deprecated_jobs_skipped',
                        level: 'warn',
                        data: { jobs: skippedDeprecated }
                    });
                }
            }
            const targetNetworks = this.getTargetNetworks();
            this.events.emitEvent({
                type: 'execution_plan',
                level: 'info',
                data: {
                    targetNetworks: targetNetworks.map(n => ({
                        name: n.name,
                        chainId: n.chainId
                    })),
                    jobExecutionOrder: jobsToRun
                }
            });
            const verificationRegistry = (0, etherscan_1.createDefaultVerificationRegistry)(this.options.etherscanApiKey);
            const engine = new engine_1.ExecutionEngine(this.loader.templates, {
                eventEmitter: this.events,
                verificationRegistry,
                noPostCheckConditions: this.noPostCheckConditions,
                ignoreVerifyErrors: this.options.ignoreVerifyErrors ?? false
            });
            let hasFailures = false;
            const signerInfoPrintedForChain = new Set();
            for (const network of targetNetworks) {
                this.events.emitEvent({
                    type: 'network_started',
                    level: 'info',
                    data: {
                        networkName: network.name,
                        chainId: network.chainId
                    }
                });
                for (const jobName of jobsToRun) {
                    const job = this.loader.jobs.get(jobName);
                    if (!this.results.has(job.name)) {
                        this.results.set(job.name, { job, outputs: new Map() });
                    }
                    if (this.shouldSkipJobOnNetwork(job, network)) {
                        this.events.emitEvent({
                            type: 'job_skipped',
                            level: 'warn',
                            data: {
                                jobName,
                                networkName: network.name,
                                reason: 'configuration'
                            }
                        });
                        this.results.get(job.name).outputs.set(network.chainId, {
                            status: 'skipped',
                            data: 'Job skipped due to network configuration'
                        });
                        continue;
                    }
                    let context;
                    try {
                        context = new context_1.ExecutionContext(network, this.options.privateKey, this.loader.contractRepository, this.options.etherscanApiKey, this.loader.constants);
                        if (typeof context.setJobConstants === 'function') {
                            context.setJobConstants(job.constants);
                        }
                        if (!signerInfoPrintedForChain.has(network.chainId)) {
                            try {
                                const getSignerFn = context.getResolvedSigner;
                                const signer = getSignerFn
                                    ? await getSignerFn.call(context)
                                    : context.signer;
                                if (signer && typeof signer.getAddress === 'function') {
                                    const address = await signer.getAddress();
                                    const provider = context.provider;
                                    if (provider && typeof provider.getBalance === 'function') {
                                        const balanceBn = await provider.getBalance(address);
                                        const balanceWei = balanceBn.toString();
                                        const balanceEth = (Number(balanceBn) / 1e18).toString();
                                        this.events.emitEvent({
                                            type: 'network_signer_info',
                                            level: 'info',
                                            data: {
                                                networkName: network.name,
                                                chainId: network.chainId,
                                                address,
                                                balanceWei,
                                                balance: balanceEth
                                            }
                                        });
                                    }
                                }
                            }
                            catch {
                            }
                            finally {
                                signerInfoPrintedForChain.add(network.chainId);
                            }
                        }
                        if (job.skip_condition) {
                            const shouldSkip = await engine.evaluateSkipConditions(job.skip_condition, context, new Map());
                            if (shouldSkip) {
                                this.results.get(job.name).outputs.set(network.chainId, {
                                    status: 'skipped',
                                    data: `Job "${job.name}" skipped due to skip condition`
                                });
                                this.events.emitEvent({
                                    type: 'job_skipped',
                                    level: 'warn',
                                    data: {
                                        jobName: job.name,
                                        networkName: network.name,
                                        reason: 'skip_condition'
                                    }
                                });
                                continue;
                            }
                        }
                        this.populateContextWithDependentJobOutputs(job, context, network);
                        await engine.executeJob(job, context);
                        this.results.get(job.name).outputs.set(network.chainId, {
                            status: 'success',
                            data: context.getOutputs()
                        });
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        this.results.get(job.name).outputs.set(network.chainId, {
                            status: 'error',
                            data: errorMessage
                        });
                        this.events.emitEvent({
                            type: 'job_execution_failed',
                            level: 'error',
                            data: {
                                jobName: job.name,
                                networkName: network.name,
                                chainId: network.chainId,
                                error: errorMessage
                            }
                        });
                        hasFailures = true;
                        if (this.options.failEarly) {
                            throw error;
                        }
                    }
                    finally {
                        if (context) {
                            try {
                                await context.dispose();
                            }
                            catch (disposeError) {
                                this.events.emitEvent({
                                    type: 'context_disposal_warning',
                                    level: 'warn',
                                    data: {
                                        jobName: job.name,
                                        networkName: network.name,
                                        error: disposeError instanceof Error ? disposeError.message : String(disposeError)
                                    }
                                });
                            }
                        }
                    }
                }
            }
            await this.writeOutputFiles();
            if (this.options.ignoreVerifyErrors) {
                this.emitVerificationWarningsReport(engine);
            }
            if (this.showSummary) {
                this.emitRunSummary(hasFailures);
            }
            if (hasFailures) {
                const error = new Error('One or more jobs failed during execution');
                const failedJobs = [];
                for (const [, result] of this.results) {
                    const job = result.job;
                    for (const [chainId, netResult] of result.outputs) {
                        if (netResult.status === 'error') {
                            const network = this.options.networks.find(n => n.chainId === chainId);
                            failedJobs.push({
                                jobName: job.name,
                                networkName: network?.name || `chain-${chainId}`,
                                chainId,
                                error: String(netResult.data)
                            });
                        }
                    }
                }
                this.events.emitEvent({
                    type: 'deployment_failed',
                    level: 'error',
                    data: {
                        error: error.message,
                        stack: error.stack,
                        failedJobs
                    }
                });
                throw error;
            }
            this.events.emitEvent({
                type: 'deployment_completed',
                level: 'info'
            });
        }
        catch (error) {
            this.events.emitEvent({
                type: 'deployment_failed',
                level: 'error',
                data: {
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined
                }
            });
            throw error;
        }
    }
    emitRunSummary(hasFailures) {
        const jobCount = this.results.size;
        let successCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        for (const [, result] of this.results) {
            for (const [, netResult] of result.outputs) {
                if (netResult.status === 'success')
                    successCount++;
                else if (netResult.status === 'skipped')
                    skippedCount++;
                else if (netResult.status === 'error')
                    failedCount++;
            }
        }
        const keyContracts = [];
        for (const [, result] of this.results) {
            for (const [, netResult] of result.outputs) {
                if (netResult.status !== 'success')
                    continue;
                const outputs = netResult.data;
                for (const [k, v] of outputs) {
                    if (k.endsWith('.address') && typeof v === 'string') {
                        const action = k.split('.')[0];
                        keyContracts.push({ job: result.job.name, action, address: v });
                    }
                }
            }
        }
        const summaryEvent = {
            type: 'run_summary',
            level: (hasFailures ? 'warn' : 'info'),
            data: {
                networkCount: this.options.networks.length,
                jobCount,
                successCount,
                failedCount,
                skippedCount,
                keyContracts: keyContracts.slice(0, 10)
            }
        };
        this.events.emitEvent(summaryEvent);
    }
    emitVerificationWarningsReport(engine) {
        const warnings = engine.getVerificationWarnings();
        if (warnings.length > 0) {
            this.events.emitEvent({
                type: 'verification_warnings_report',
                level: 'warn',
                data: {
                    totalWarnings: warnings.length,
                    warnings: warnings
                }
            });
        }
    }
    getJobExecutionPlan(fullOrder) {
        const expandRunJobs = (patterns) => {
            const allJobNames = Array.from(this.loader.jobs.keys());
            const isPattern = (s) => /[*?]/.test(s);
            const escapeRegex = (s) => s.replace(/[-\\^$+?.()|[\]{}*?]/g, '\\$&');
            const patternToRegex = (pattern) => {
                const escaped = escapeRegex(pattern)
                    .replace(/\\\*/g, '.*')
                    .replace(/\\\?/g, '.');
                return new RegExp(`^${escaped}$`);
            };
            const expanded = [];
            const seen = new Set();
            for (const p of patterns) {
                if (!isPattern(p)) {
                    if (!this.loader.jobs.has(p)) {
                        throw new Error(`Specified job "${p}" not found in project.`);
                    }
                    if (!seen.has(p)) {
                        seen.add(p);
                        expanded.push(p);
                    }
                    continue;
                }
                const re = patternToRegex(p);
                const matches = allJobNames.filter(name => re.test(name));
                if (matches.length === 0) {
                    throw new Error(`Job pattern "${p}" did not match any jobs in project.`);
                }
                for (const m of matches) {
                    if (!seen.has(m)) {
                        seen.add(m);
                        expanded.push(m);
                    }
                }
            }
            return expanded;
        };
        const isDeprecated = (jobName) => {
            const j = this.loader.jobs.get(jobName);
            return !!(j && j.deprecated === true);
        };
        if (!this.options.runJobs || this.options.runJobs.length === 0) {
            if (this.options.runDeprecated) {
                return fullOrder;
            }
            const nonDeprecatedJobs = new Set(fullOrder.filter(name => !isDeprecated(name)));
            const requiredDeprecated = new Set();
            for (const jobName of nonDeprecatedJobs) {
                const deps = this.graph?.getDependencies(jobName) || new Set();
                for (const dep of deps) {
                    if (isDeprecated(dep)) {
                        requiredDeprecated.add(dep);
                    }
                }
            }
            const allowed = new Set([...nonDeprecatedJobs, ...requiredDeprecated]);
            return fullOrder.filter(name => allowed.has(name));
        }
        const expandedRunJobs = expandRunJobs(this.options.runJobs);
        const explicitlyRequested = new Set(expandedRunJobs);
        const jobsToRun = new Set();
        for (const jobName of expandedRunJobs) {
            jobsToRun.add(jobName);
            const dependencies = this.graph?.getDependencies(jobName) || new Set();
            dependencies.forEach((dep) => jobsToRun.add(dep));
        }
        const depsOfRequested = new Set();
        for (const jobName of expandedRunJobs) {
            const deps = this.graph?.getDependencies(jobName) || new Set();
            deps.forEach(d => depsOfRequested.add(d));
        }
        const filtered = Array.from(jobsToRun).filter(name => {
            if (!isDeprecated(name))
                return true;
            if (explicitlyRequested.has(name))
                return true;
            if (depsOfRequested.has(name))
                return true;
            return this.options.runDeprecated === true;
        });
        const allowedSet = new Set(filtered);
        return fullOrder.filter(jobName => allowedSet.has(jobName));
    }
    getTargetNetworks() {
        if (!this.options.runOnNetworks || this.options.runOnNetworks.length === 0) {
            return this.options.networks;
        }
        const targetChainIds = new Set(this.options.runOnNetworks);
        const filteredNetworks = this.options.networks.filter(n => targetChainIds.has(n.chainId));
        if (filteredNetworks.length !== this.options.runOnNetworks.length) {
            const foundIds = new Set(filteredNetworks.map(n => n.chainId));
            const missingIds = this.options.runOnNetworks.filter(id => !foundIds.has(id));
            this.events.emitEvent({
                type: 'missing_network_config_warning',
                level: 'warn',
                data: {
                    missingChainIds: missingIds
                }
            });
        }
        return filteredNetworks;
    }
    shouldSkipJobOnNetwork(job, network) {
        const jobWithNetworkFilters = job;
        const hasOnly = !!(jobWithNetworkFilters.only_networks && jobWithNetworkFilters.only_networks.length > 0);
        if (hasOnly) {
            if (!jobWithNetworkFilters.only_networks.includes(network.chainId)) {
                return true;
            }
        }
        else {
            if (jobWithNetworkFilters.skip_networks && jobWithNetworkFilters.skip_networks.length > 0) {
                if (jobWithNetworkFilters.skip_networks.includes(network.chainId)) {
                    return true;
                }
            }
        }
        if (jobWithNetworkFilters.min_evm_version) {
            const jobMin = this.normalizeEvmVersion(jobWithNetworkFilters.min_evm_version);
            const chainEvm = network.evmVersion ? this.normalizeEvmVersion(network.evmVersion) : undefined;
            if (jobMin && chainEvm) {
                return this.compareEvmVersions(chainEvm, jobMin) < 0;
            }
        }
        return false;
    }
    normalizeEvmVersion(identifier) {
        if (!identifier)
            return undefined;
        const id = String(identifier).trim().toLowerCase();
        const aliasMap = {
            frontier: 'frontier',
            homestead: 'homestead',
            'tangerine whistle': 'tangerine',
            tangerine: 'tangerine',
            'spurious dragon': 'spuriousdragon',
            spuriousdragon: 'spuriousdragon',
            byzantium: 'byzantium',
            constantinople: 'constantinople',
            petersburg: 'petersburg',
            istanbul: 'istanbul',
            berlin: 'berlin',
            london: 'london',
            merge: 'paris',
            paris: 'paris',
            shanghai: 'shanghai',
            cancun: 'cancun',
            dencun: 'cancun',
            prague: 'prague',
        };
        return aliasMap[id] || undefined;
    }
    compareEvmVersions(a, b) {
        const order = [
            'frontier',
            'homestead',
            'tangerine',
            'spuriousdragon',
            'byzantium',
            'constantinople',
            'petersburg',
            'istanbul',
            'berlin',
            'london',
            'paris',
            'shanghai',
            'cancun',
            'prague'
        ];
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia === -1 || ib === -1)
            return 0;
        if (ia < ib)
            return -1;
        if (ia > ib)
            return 1;
        return 0;
    }
    populateContextWithDependentJobOutputs(job, context, network) {
        if (!job.depends_on)
            return;
        for (const dependentJobName of job.depends_on) {
            const dependentJobResults = this.results.get(dependentJobName);
            if (!dependentJobResults) {
                throw new Error(`Job "${job.name}" depends on "${dependentJobName}", but "${dependentJobName}" has not been executed yet.`);
            }
            const networkResult = dependentJobResults.outputs.get(network.chainId);
            if (!networkResult) {
                throw new Error(`Job "${job.name}" depends on "${dependentJobName}", but "${dependentJobName}" has not been executed on network ${network.name} (chainId: ${network.chainId}).`);
            }
            if (networkResult.status === 'skipped') {
                continue;
            }
            if (networkResult.status !== 'success') {
                const errorMessage = typeof networkResult.data === 'string' ? networkResult.data : 'Unknown error';
                throw new Error(`Job "${job.name}" depends on "${dependentJobName}", but "${dependentJobName}" failed: ${errorMessage}`);
            }
            const outputs = networkResult.data;
            for (const [key, value] of outputs.entries()) {
                const prefixedKey = `${dependentJobName}.${key}`;
                context.setOutput(prefixedKey, value);
            }
        }
    }
    async writeOutputFiles() {
        if (this.results.size === 0) {
            this.events.emitEvent({
                type: 'no_outputs',
                level: 'warn'
            });
            return;
        }
        const outputRoot = path.join(this.options.projectRoot, 'output');
        await fs.mkdir(outputRoot, { recursive: true });
        this.events.emitEvent({
            type: 'output_writing_started',
            level: 'info'
        });
        for (const [jobName, resultData] of this.results.entries()) {
            let relativeJobSubpath = `${jobName}.json`;
            if (!this.options.flatOutput && resultData.job._path) {
                const jobsDir = path.join(this.options.projectRoot, 'jobs');
                const normalizedJobPath = path.normalize(resultData.job._path);
                const normalizedJobsDir = path.normalize(jobsDir);
                if (normalizedJobPath.startsWith(normalizedJobsDir)) {
                    const relFromJobs = path.relative(normalizedJobsDir, normalizedJobPath);
                    const dirPart = path.dirname(relFromJobs);
                    const fileBase = path.basename(relFromJobs, path.extname(relFromJobs));
                    relativeJobSubpath = dirPart === '.' ? `${fileBase}.json` : path.join(dirPart, `${fileBase}.json`);
                }
                else {
                    relativeJobSubpath = `${jobName}.json`;
                }
            }
            const outputFilePath = path.join(outputRoot, relativeJobSubpath);
            const outputFileDir = path.dirname(outputFilePath);
            await fs.mkdir(outputFileDir, { recursive: true });
            const groupedResults = this.groupNetworkResults(resultData.outputs, resultData.job);
            const fileContent = {
                jobName: resultData.job.name,
                jobVersion: resultData.job.version,
                lastRun: new Date().toISOString(),
                networks: groupedResults
            };
            await fs.writeFile(outputFilePath, JSON.stringify(fileContent, null, 2));
            this.events.emitEvent({
                type: 'output_file_written',
                level: 'info',
                data: {
                    relativePath: path.relative(this.options.projectRoot, outputFilePath)
                }
            });
        }
    }
    filterOutputsByActionFlags(outputs, job) {
        const actionsWithCustomMap = job.actions.filter(a => a.output && typeof a.output === 'object' && a.output !== null);
        const actionsWithTrue = job.actions.filter(a => a.output === true);
        const actionsWithFalse = new Set(job.actions.filter(a => a.output === false).map(a => a.name));
        const result = new Map();
        const includeAllForAction = (actionName) => {
            for (const [key, value] of outputs) {
                if (key.startsWith(`${actionName}.`)) {
                    result.set(key, value);
                }
            }
        };
        if (actionsWithCustomMap.length > 0) {
            for (const action of actionsWithCustomMap) {
                const prefix = `${action.name}.`;
                for (const mappedKey of Object.keys(action.output)) {
                    const normalizedKey = mappedKey.startsWith(prefix) ? mappedKey : `${prefix}${mappedKey}`;
                    if (outputs.has(normalizedKey)) {
                        result.set(normalizedKey, outputs.get(normalizedKey));
                    }
                }
            }
        }
        const actionsWithTrueNames = new Set(actionsWithTrue.map(a => a.name));
        for (const actionName of actionsWithTrueNames) {
            const hadCustom = actionsWithCustomMap.some(a => a.name === actionName);
            if (!hadCustom) {
                includeAllForAction(actionName);
            }
        }
        const hasExplicitOutputSelection = actionsWithCustomMap.length > 0 || actionsWithTrue.length > 0;
        if (hasExplicitOutputSelection) {
            for (const falseActionName of actionsWithFalse) {
                for (const key of Array.from(result.keys())) {
                    if (key.startsWith(`${falseActionName}.`)) {
                        result.delete(key);
                    }
                }
            }
            return Object.fromEntries(result);
        }
        if (job.depends_on && job.depends_on.length > 0) {
            return this.filterOutDependencyOutputs(outputs, job);
        }
        return Object.fromEntries(outputs);
    }
    filterOutDependencyOutputs(outputs, job) {
        const filtered = new Map();
        const dependencyNames = job.depends_on || [];
        for (const [key, value] of outputs) {
            const isDependencyOutput = dependencyNames.some(depName => key.startsWith(`${depName}.`));
            if (!isDependencyOutput) {
                filtered.set(key, value);
            }
        }
        return Object.fromEntries(filtered);
    }
    groupNetworkResults(outputs, job) {
        const successGroups = new Map();
        const errorEntries = [];
        for (const [chainId, result] of outputs.entries()) {
            if (result.status === 'success') {
                const outputsObj = result.data instanceof Map ? this.filterOutputsByActionFlags(result.data, job) : {};
                const key = JSON.stringify(outputsObj);
                if (!successGroups.has(key)) {
                    successGroups.set(key, {
                        chainIds: [],
                        outputs: outputsObj
                    });
                }
                successGroups.get(key).chainIds.push(chainId.toString());
            }
            else {
                errorEntries.push({
                    status: 'error',
                    chainId: chainId.toString(),
                    error: result.data
                });
            }
        }
        const successEntries = Array.from(successGroups.values()).map(group => ({
            status: 'success',
            chainIds: group.chainIds.sort(),
            outputs: group.outputs
        }));
        return [...successEntries, ...errorEntries];
    }
}
exports.Deployer = Deployer;
//# sourceMappingURL=deployer.js.map