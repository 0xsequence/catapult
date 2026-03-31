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
exports.ExecutionEngine = void 0;
const types_1 = require("../types");
const resolver_1 = require("./resolver");
const validation_1 = require("../utils/validation");
const events_1 = require("../events");
const etherscan_1 = require("../verification/etherscan");
const ethers_1 = require("ethers");
class ExecutionEngine {
    constructor(templates, options) {
        this.verificationWarnings = [];
        this.resolver = new resolver_1.ValueResolver();
        this.templates = templates;
        this.events = options?.eventEmitter || events_1.deploymentEvents;
        this.verificationRegistry = options?.verificationRegistry || (0, etherscan_1.createDefaultVerificationRegistry)();
        this.noPostCheckConditions = options?.noPostCheckConditions ?? false;
        this.allowMultipleNicksMethodTests = options?.allowMultipleNicksMethodTests ?? false;
        this.ignoreVerifyErrors = options?.ignoreVerifyErrors ?? false;
    }
    getPostCheckRetryConfig(context) {
        const network = context.getNetwork();
        const isLocal = network.chainId === 31337 ||
            network.chainId === 1337 ||
            /localhost|127\.0\.0\.1/i.test(network.rpcUrl);
        if (isLocal) {
            return { retries: 100, delayMs: 50 };
        }
        return { retries: 15, delayMs: 2000 };
    }
    async executeJob(job, context) {
        this.events.emitEvent({
            type: 'job_started',
            level: 'info',
            data: {
                jobName: job.name,
                jobVersion: job.version,
                networkName: context.getNetwork().name,
                chainId: context.getNetwork().chainId
            }
        });
        const previousContextPath = context.getContextPath();
        context.setContextPath(job._path);
        try {
            const executionOrder = this.topologicalSortActions(job);
            for (const actionName of executionOrder) {
                const action = job.actions.find(a => a.name === actionName);
                if (!action) {
                    throw new Error(`Internal error: Action "${actionName}" not found in job "${job.name}".`);
                }
                await this.executeAction(action, context, new Map());
            }
            if (!this.noPostCheckConditions && job.skip_condition) {
                const { retries, delayMs } = this.getPostCheckRetryConfig(context);
                const shouldSkip = await this.retryBooleanCheck(async () => this.evaluateSkipConditions(job.skip_condition, context, new Map()), retries, delayMs);
                if (!shouldSkip) {
                    throw new Error(`Job "${job.name}" failed post-execution check: skip conditions did not evaluate to true`);
                }
            }
        }
        finally {
            context.setContextPath(previousContextPath);
        }
        this.events.emitEvent({
            type: 'job_completed',
            level: 'info',
            data: {
                jobName: job.name,
                networkName: context.getNetwork().name,
                chainId: context.getNetwork().chainId
            }
        });
    }
    async executeAction(action, context, scope) {
        const actionName = 'name' in action ? action.name : action.type;
        const templateName = 'template' in action
            ? (action.template || action.type)
            : action.type;
        if (!templateName) {
            throw new Error(`Action "${actionName}": missing both template and type fields`);
        }
        const printableName = (typeof actionName === 'string' && actionName.trim().length > 0)
            ? actionName
            : ((0, types_1.isPrimitiveActionType)(templateName) ? templateName : `template:${templateName}`);
        this.events.emitEvent({
            type: 'action_started',
            level: 'info',
            data: {
                actionName: printableName,
                jobName: 'unknown'
            }
        });
        const shouldSkip = await this.evaluateSkipConditions(action.skip_condition, context, scope);
        if (shouldSkip) {
            this.events.emitEvent({
                type: 'action_skipped',
                level: 'info',
                data: {
                    actionName: actionName,
                    reason: 'condition met'
                }
            });
            const hasCustomOutput = 'name' in action && action.name &&
                action.output &&
                typeof action.output === 'object' &&
                !Array.isArray(action.output);
            if (hasCustomOutput) {
                const customOutput = action.output;
                for (const [key, value] of Object.entries(customOutput)) {
                    const resolvedOutput = await this.resolver.resolve(value, context, scope);
                    const outputKey = `${action.name}.${key}`;
                    context.setOutput(outputKey, resolvedOutput);
                    this.events.emitEvent({
                        type: 'output_stored',
                        level: 'debug',
                        data: {
                            outputKey,
                            value: resolvedOutput
                        }
                    });
                }
            }
            return;
        }
        if ((0, types_1.isPrimitiveActionType)(templateName)) {
            const hasCustomOutput = 'name' in action && action.name &&
                action.output &&
                typeof action.output === 'object' &&
                !Array.isArray(action.output);
            const primitiveAction = 'template' in action
                ? {
                    type: (action.type || action.template),
                    name: action.name,
                    arguments: action.arguments,
                    skip_condition: action.skip_condition,
                    depends_on: action.depends_on
                }
                : action;
            await this.executePrimitive(primitiveAction, context, scope, hasCustomOutput);
            if (hasCustomOutput) {
                const customOutput = action.output;
                for (const [key, value] of Object.entries(customOutput)) {
                    const resolvedOutput = await this.resolver.resolve(value, context, scope);
                    const outputKey = `${action.name}.${key}`;
                    context.setOutput(outputKey, resolvedOutput);
                    this.events.emitEvent({
                        type: 'output_stored',
                        level: 'debug',
                        data: {
                            outputKey,
                            value: resolvedOutput
                        }
                    });
                }
            }
        }
        else {
            await this.executeTemplate(action, templateName, context, scope);
        }
    }
    async executeTemplate(callingAction, templateName, context, parentScope = new Map()) {
        const template = this.templates.get(templateName);
        if (!template) {
            const actionName = 'name' in callingAction ? callingAction.name : callingAction.type;
            throw new Error(`Template "${templateName}" not found for action "${actionName}".`);
        }
        this.events.emitEvent({
            type: 'template_entered',
            level: 'debug',
            data: {
                templateName: template.name
            }
        });
        const templateScope = new Map();
        if ('arguments' in callingAction) {
            for (const [key, value] of Object.entries(callingAction.arguments)) {
                const resolvedValue = await this.resolver.resolve(value, context, parentScope);
                templateScope.set(key, resolvedValue);
            }
        }
        const previousContextPath = context.getContextPath();
        context.setContextPath(template._path);
        try {
            if (template.setup) {
                if (template.setup.skip_condition && await this.evaluateSkipConditions(template.setup.skip_condition, context, templateScope)) {
                    this.events.emitEvent({
                        type: 'template_setup_skipped',
                        level: 'info',
                        data: {
                            templateName: template.name,
                            reason: 'setup skip condition met'
                        }
                    });
                }
                else if (template.setup.actions) {
                    this.events.emitEvent({
                        type: 'template_setup_started',
                        level: 'debug',
                        data: {
                            templateName: template.name
                        }
                    });
                    for (const setupAction of template.setup.actions) {
                        await this.executeAction(setupAction, context, templateScope);
                    }
                    this.events.emitEvent({
                        type: 'template_setup_completed',
                        level: 'debug',
                        data: {
                            templateName: template.name
                        }
                    });
                }
            }
            const templateSkipConditions = template.skip_condition;
            const templateShouldSkip = await this.evaluateSkipConditions(templateSkipConditions, context, templateScope);
            if (templateShouldSkip) {
                this.events.emitEvent({
                    type: 'template_skipped',
                    level: 'info',
                    data: {
                        templateName: template.name,
                        reason: 'condition met'
                    }
                });
            }
            else {
                for (const templateAction of template.actions) {
                    await this.executeAction(templateAction, context, templateScope);
                }
            }
            if (!this.noPostCheckConditions && template.skip_condition) {
                const { retries, delayMs } = this.getPostCheckRetryConfig(context);
                const shouldSkip = await this.retryBooleanCheck(async () => this.evaluateSkipConditions(template.skip_condition, context, templateScope), retries, delayMs);
                if (!shouldSkip) {
                    throw new Error(`Template "${template.name}" failed post-execution check: skip conditions did not evaluate to true`);
                }
            }
            if ('name' in callingAction) {
                const actionName = callingAction.name;
                const customOutput = callingAction.output;
                if (customOutput && typeof customOutput === 'object' && !Array.isArray(customOutput)) {
                    for (const [key, value] of Object.entries(customOutput)) {
                        const resolvedOutput = await this.resolver.resolve(value, context, templateScope);
                        const outputKey = `${actionName}.${key}`;
                        context.setOutput(outputKey, resolvedOutput);
                        this.events.emitEvent({
                            type: 'output_stored',
                            level: 'debug',
                            data: {
                                outputKey,
                                value: resolvedOutput
                            }
                        });
                    }
                }
                else if (template.outputs) {
                    for (const [key, value] of Object.entries(template.outputs)) {
                        const resolvedOutput = await this.resolver.resolve(value, context, templateScope);
                        const outputKey = `${actionName}.${key}`;
                        context.setOutput(outputKey, resolvedOutput);
                        this.events.emitEvent({
                            type: 'output_stored',
                            level: 'debug',
                            data: {
                                outputKey,
                                value: resolvedOutput
                            }
                        });
                    }
                }
            }
            this.events.emitEvent({
                type: 'template_exited',
                level: 'debug',
                data: {
                    templateName: template.name
                }
            });
        }
        finally {
            context.setContextPath(previousContextPath);
        }
    }
    async executePrimitive(action, context, scope, hasCustomOutput = false) {
        const actionName = action.name || action.type;
        this.events.emitEvent({
            type: 'primitive_action',
            level: 'debug',
            data: {
                actionType: action.type
            }
        });
        switch (action.type) {
            case 'send-transaction': {
                const resolvedTo = await this.resolver.resolve(action.arguments.to, context, scope);
                const resolvedData = action.arguments.data ? await this.resolver.resolve(action.arguments.data, context, scope) : '0x';
                const resolvedValue = action.arguments.value ? await this.resolver.resolve(action.arguments.value, context, scope) : 0;
                const resolvedGasMultiplier = action.arguments.gasMultiplier !== undefined ? await this.resolver.resolve(action.arguments.gasMultiplier, context, scope) : undefined;
                const to = (0, validation_1.validateAddress)(resolvedTo, actionName);
                const data = (0, validation_1.validateHexData)(resolvedData, actionName, 'data');
                const value = (0, validation_1.validateBigNumberish)(resolvedValue, actionName, 'value');
                let gasMultiplier;
                if (resolvedGasMultiplier !== undefined) {
                    if (typeof resolvedGasMultiplier !== 'number' || resolvedGasMultiplier <= 0) {
                        throw new Error(`Action "${actionName}": gasMultiplier must be a positive number, got: ${resolvedGasMultiplier}`);
                    }
                    gasMultiplier = resolvedGasMultiplier;
                }
                const txParams = { to, data, value };
                const network = context.getNetwork();
                const signer = await context.getResolvedSigner();
                if (network.gasLimit) {
                    const baseGasLimit = network.gasLimit;
                    txParams.gasLimit = gasMultiplier ? Math.floor(baseGasLimit * gasMultiplier) : baseGasLimit;
                }
                else if (gasMultiplier) {
                    const estimatedGas = await signer.estimateGas({ to, data, value });
                    txParams.gasLimit = Math.floor(Number(estimatedGas) * gasMultiplier);
                }
                await this.checkFundsForTransaction(actionName, txParams, context, signer);
                const tx = await signer.sendTransaction(txParams);
                this.events.emitEvent({
                    type: 'transaction_sent',
                    level: 'info',
                    data: {
                        to,
                        value: value.toString(),
                        dataPreview: String(data).substring(0, 42),
                        txHash: tx.hash
                    }
                });
                const receipt = await tx.wait();
                if (!receipt || receipt.status !== 1) {
                    throw new Error(`Transaction for action "${actionName}" failed (reverted). Hash: ${tx.hash}`);
                }
                this.events.emitEvent({
                    type: 'transaction_confirmed',
                    level: 'info',
                    data: {
                        txHash: tx.hash,
                        blockNumber: receipt.blockNumber
                    }
                });
                if (action.name && !hasCustomOutput) {
                    context.setOutput(`${action.name}.hash`, tx.hash);
                    context.setOutput(`${action.name}.receipt`, receipt);
                }
                break;
            }
            case 'send-signed-transaction': {
                const resolvedRawTx = await this.resolver.resolve(action.arguments.transaction, context, scope);
                const rawTx = (0, validation_1.validateRawTransaction)(resolvedRawTx, actionName);
                const tx = await context.provider.broadcastTransaction(rawTx);
                this.events.emitEvent({
                    type: 'transaction_sent',
                    level: 'info',
                    data: {
                        to: '',
                        value: '0',
                        dataPreview: 'signed transaction',
                        txHash: tx.hash
                    }
                });
                const receipt = await tx.wait();
                if (!receipt || receipt.status !== 1) {
                    throw new Error(`Signed transaction for action "${actionName}" failed (reverted). Hash: ${tx.hash}`);
                }
                this.events.emitEvent({
                    type: 'transaction_confirmed',
                    level: 'info',
                    data: {
                        txHash: tx.hash,
                        blockNumber: receipt.blockNumber
                    }
                });
                if (action.name && !hasCustomOutput) {
                    context.setOutput(`${action.name}.hash`, tx.hash);
                    context.setOutput(`${action.name}.receipt`, receipt);
                }
                break;
            }
            case 'verify-contract': {
                const actionName = action.name || action.type;
                const resolvedAddress = await this.resolver.resolve(action.arguments.address, context, scope);
                const resolvedContract = await this.resolver.resolve(action.arguments.contract, context, scope);
                const resolvedConstructorArgs = action.arguments.constructorArguments
                    ? await this.resolver.resolve(action.arguments.constructorArguments, context, scope)
                    : undefined;
                const resolvedPlatform = action.arguments.platform
                    ? await this.resolver.resolve(action.arguments.platform, context, scope)
                    : 'all';
                const address = (0, validation_1.validateAddress)(resolvedAddress, actionName);
                if (!resolvedContract || typeof resolvedContract !== 'object') {
                    throw new Error(`Action "${actionName}": contract must be a Contract object`);
                }
                const contract = resolvedContract;
                let platformsToTry;
                if (resolvedPlatform === 'all') {
                    platformsToTry = ['all'];
                }
                else if (typeof resolvedPlatform === 'string') {
                    platformsToTry = [resolvedPlatform];
                }
                else if (Array.isArray(resolvedPlatform)) {
                    if (!resolvedPlatform.every(p => typeof p === 'string')) {
                        throw new Error(`Action "${actionName}": platform array must contain only strings`);
                    }
                    platformsToTry = resolvedPlatform;
                }
                else {
                    throw new Error(`Action "${actionName}": platform must be a string, array of strings, or 'all'`);
                }
                if (!contract.sourceName) {
                    throw new Error(`Action "${actionName}": Contract is missing sourceName required for verification`);
                }
                if (!contract.contractName) {
                    throw new Error(`Action "${actionName}": Contract is missing contractName required for verification`);
                }
                if (!contract.compiler) {
                    throw new Error(`Action "${actionName}": Contract is missing compiler information required for verification`);
                }
                if (!contract.buildInfoId) {
                    throw new Error(`Action "${actionName}": Contract is missing buildInfoId required for verification`);
                }
                let constructorArguments;
                if (resolvedConstructorArgs !== undefined) {
                    constructorArguments = (0, validation_1.validateHexData)(resolvedConstructorArgs, actionName, 'constructorArguments');
                }
                const network = context.getNetwork();
                const contractName = `${contract.sourceName}:${contract.contractName}`;
                if (platformsToTry.includes('all')) {
                    const configuredPlatforms = this.verificationRegistry.getConfiguredPlatforms(network);
                    if (configuredPlatforms.length === 0) {
                        this.events.emitEvent({
                            type: 'action_skipped',
                            level: 'warn',
                            data: {
                                actionName: actionName,
                                reason: `No configured verification platforms available for network ${network.name}`
                            }
                        });
                        return;
                    }
                    let anySuccess = false;
                    for (const platform of configuredPlatforms) {
                        try {
                            await this.verifyOnSinglePlatform(platform, contract, address, constructorArguments, network, actionName, contractName, action, context, hasCustomOutput);
                            anySuccess = true;
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            if (this.ignoreVerifyErrors) {
                                this.verificationWarnings.push({
                                    actionName: actionName,
                                    address,
                                    contractName,
                                    platform: platform.name,
                                    error: errorMessage,
                                    networkName: network.name
                                });
                            }
                            this.events.emitEvent({
                                type: 'verification_failed',
                                level: 'warn',
                                data: {
                                    actionName: actionName,
                                    address,
                                    contractName,
                                    platform: platform.name,
                                    error: errorMessage
                                }
                            });
                        }
                    }
                    if (!anySuccess) {
                        if (this.ignoreVerifyErrors) {
                            this.events.emitEvent({
                                type: 'verification_skipped',
                                level: 'warn',
                                data: {
                                    actionName: actionName,
                                    reason: `Verification failed on all configured platforms for network ${network.name}, but continuing due to --ignore-verify-errors`
                                }
                            });
                        }
                        else {
                            throw new Error(`Verification failed on all configured platforms for network ${network.name}`);
                        }
                    }
                }
                else {
                    let anySuccess = false;
                    for (const platformName of platformsToTry) {
                        const platform = this.verificationRegistry.get(platformName);
                        if (!platform) {
                            throw new Error(`Action "${actionName}": Unsupported verification platform "${platformName}"`);
                        }
                        try {
                            await this.verifyOnSinglePlatform(platform, contract, address, constructorArguments, network, actionName, contractName, action, context, hasCustomOutput);
                            anySuccess = true;
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            if (this.ignoreVerifyErrors) {
                                this.verificationWarnings.push({
                                    actionName: actionName,
                                    address,
                                    contractName,
                                    platform: platform.name,
                                    error: errorMessage,
                                    networkName: network.name
                                });
                            }
                            this.events.emitEvent({
                                type: 'verification_failed',
                                level: platformsToTry.length > 1 ? 'warn' : 'error',
                                data: {
                                    actionName: actionName,
                                    address,
                                    contractName,
                                    platform: platform.name,
                                    error: errorMessage
                                }
                            });
                            if (platformsToTry.length === 1 && !this.ignoreVerifyErrors) {
                                throw error;
                            }
                        }
                    }
                    if (!anySuccess && platformsToTry.length > 1) {
                        if (this.ignoreVerifyErrors) {
                            this.events.emitEvent({
                                type: 'verification_skipped',
                                level: 'warn',
                                data: {
                                    actionName: actionName,
                                    reason: `Verification failed on all specified platforms: ${platformsToTry.join(', ')}, but continuing due to --ignore-verify-errors`
                                }
                            });
                        }
                        else {
                            throw new Error(`Verification failed on all specified platforms: ${platformsToTry.join(', ')}`);
                        }
                    }
                }
                break;
            }
            case 'static': {
                const resolvedValue = await this.resolver.resolve(action.arguments.value, context, scope);
                if (action.name && !hasCustomOutput) {
                    context.setOutput(`${action.name}.value`, resolvedValue);
                }
                break;
            }
            case 'create-contract': {
                const resolvedData = await this.resolver.resolve(action.arguments.data, context, scope);
                const resolvedValue = action.arguments.value ? await this.resolver.resolve(action.arguments.value, context, scope) : 0;
                const resolvedGasMultiplier = action.arguments.gasMultiplier !== undefined ? await this.resolver.resolve(action.arguments.gasMultiplier, context, scope) : undefined;
                const data = (0, validation_1.validateHexData)(resolvedData, actionName, 'data');
                const value = (0, validation_1.validateBigNumberish)(resolvedValue, actionName, 'value');
                let gasMultiplier;
                if (resolvedGasMultiplier !== undefined) {
                    if (typeof resolvedGasMultiplier !== 'number' || resolvedGasMultiplier <= 0) {
                        throw new Error(`Action "${actionName}": gasMultiplier must be a positive number, got: ${resolvedGasMultiplier}`);
                    }
                    gasMultiplier = resolvedGasMultiplier;
                }
                const txParams = { to: null, data, value };
                const network = context.getNetwork();
                const signer = await context.getResolvedSigner();
                if (network.gasLimit) {
                    const baseGasLimit = network.gasLimit;
                    txParams.gasLimit = gasMultiplier ? Math.floor(baseGasLimit * gasMultiplier) : baseGasLimit;
                }
                else if (gasMultiplier) {
                    const estimatedGas = await signer.estimateGas(txParams);
                    txParams.gasLimit = Math.floor(Number(estimatedGas) * gasMultiplier);
                }
                await this.checkFundsForTransaction(actionName, txParams, context, signer);
                const tx = await signer.sendTransaction(txParams);
                this.events.emitEvent({
                    type: 'transaction_sent',
                    level: 'info',
                    data: {
                        to: 'contract creation',
                        value: value.toString(),
                        dataPreview: String(data).substring(0, 42),
                        txHash: tx.hash
                    }
                });
                const receipt = await tx.wait();
                if (!receipt || receipt.status !== 1) {
                    throw new Error(`Contract creation for action "${actionName}" failed (reverted). Hash: ${tx.hash}`);
                }
                if (!receipt.contractAddress) {
                    throw new Error(`Contract creation for action "${actionName}" did not return a contract address. Hash: ${tx.hash}`);
                }
                this.events.emitEvent({
                    type: 'transaction_confirmed',
                    level: 'info',
                    data: {
                        txHash: tx.hash,
                        blockNumber: receipt.blockNumber
                    }
                });
                this.events.emitEvent({
                    type: 'contract_created',
                    level: 'info',
                    data: {
                        contractAddress: receipt.contractAddress,
                        txHash: tx.hash,
                        blockNumber: receipt.blockNumber
                    }
                });
                if (action.name && !hasCustomOutput) {
                    context.setOutput(`${action.name}.hash`, tx.hash);
                    context.setOutput(`${action.name}.receipt`, receipt);
                    context.setOutput(`${action.name}.address`, receipt.contractAddress);
                }
                break;
            }
            case 'test-nicks-method': {
                if (this.nicksMethodResult !== undefined && !this.allowMultipleNicksMethodTests) {
                    if (this.nicksMethodResult === false) {
                        throw new Error(`Nick's method test already failed this run`);
                    }
                    this.events.emitEvent({
                        type: 'debug_info',
                        level: 'debug',
                        data: {
                            message: `Nick's method test already passed this run`,
                        },
                    });
                    break;
                }
                const defaultBytecode = '0x608060405234801561001057600080fd5b5061013d806100206000396000f3fe60806040526004361061001e5760003560e01c80639c4ae2d014610023575b600080fd5b6100cb6004803603604081101561003957600080fd5b81019060208101813564010000000081111561005457600080fd5b82018360208201111561006657600080fd5b8035906020019184600183028401116401000000008311171561008857600080fd5b91908080601f01602080910402602001604051908101604052809392919081815260200183838082843760009201919091525092955050913592506100cd915050565b005b60008183516020850134f56040805173ffffffffffffffffffffffffffffffffffffffff83168152905191925081900360200190a050505056fea264697066735822122033609f614f03931b92d88c309d698449bb77efcd517328d341fa4f923c5d8c7964736f6c63430007060033';
                const args = action.arguments || {};
                const resolvedBytecode = args.bytecode ? await this.resolver.resolve(args.bytecode, context, scope) : defaultBytecode;
                const resolvedGasPrice = args.gasPrice ? await this.resolver.resolve(args.gasPrice, context, scope) : undefined;
                const resolvedGasLimit = args.gasLimit ? await this.resolver.resolve(args.gasLimit, context, scope) : undefined;
                const resolvedFundingAmount = args.fundingAmount ? await this.resolver.resolve(args.fundingAmount, context, scope) : undefined;
                const bytecode = (0, validation_1.validateHexData)(resolvedBytecode, actionName, 'bytecode');
                const gasPrice = resolvedGasPrice ? (0, validation_1.validateBigNumberish)(resolvedGasPrice, actionName, 'gasPrice') : undefined;
                const gasLimit = resolvedGasLimit ? (0, validation_1.validateBigNumberish)(resolvedGasLimit, actionName, 'gasLimit') : undefined;
                const fundingAmount = resolvedFundingAmount ? (0, validation_1.validateBigNumberish)(resolvedFundingAmount, actionName, 'fundingAmount') : undefined;
                const success = await this.testNicksMethod(bytecode, context, gasPrice, gasLimit, fundingAmount);
                this.nicksMethodResult = success;
                if (!success) {
                    throw new Error(`Nick's method test failed for action "${actionName}"`);
                }
                this.events.emitEvent({
                    type: 'action_completed',
                    level: 'info',
                    data: {
                        actionName: actionName,
                        result: 'Nick\'s method test passed'
                    }
                });
                if (action.name && !hasCustomOutput) {
                    context.setOutput(`${action.name}.success`, true);
                }
                break;
            }
            case 'json-request': {
                const resolvedUrl = await this.resolver.resolve(action.arguments.url, context, scope);
                const resolvedMethod = action.arguments.method ? await this.resolver.resolve(action.arguments.method, context, scope) : 'GET';
                const resolvedHeaders = action.arguments.headers ? await this.resolver.resolve(action.arguments.headers, context, scope) : {};
                const resolvedBody = action.arguments.body ? await this.resolver.resolve(action.arguments.body, context, scope) : undefined;
                if (typeof resolvedUrl !== 'string') {
                    throw new Error(`Action "${actionName}": url must be a string, got: ${typeof resolvedUrl}`);
                }
                if (typeof resolvedMethod !== 'string') {
                    throw new Error(`Action "${actionName}": method must be a string, got: ${typeof resolvedMethod}`);
                }
                if (resolvedHeaders && typeof resolvedHeaders !== 'object') {
                    throw new Error(`Action "${actionName}": headers must be an object, got: ${typeof resolvedHeaders}`);
                }
                try {
                    const fetchOptions = {
                        method: resolvedMethod.toUpperCase(),
                        headers: {
                            'Content-Type': 'application/json',
                            ...resolvedHeaders
                        }
                    };
                    if (resolvedBody !== undefined && resolvedMethod.toUpperCase() !== 'GET') {
                        fetchOptions.body = JSON.stringify(resolvedBody);
                    }
                    this.events.emitEvent({
                        type: 'action_started',
                        level: 'info',
                        data: {
                            actionName: actionName,
                            message: `Making ${resolvedMethod.toUpperCase()} request to ${resolvedUrl}`
                        }
                    });
                    const response = await fetch(resolvedUrl, fetchOptions);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    const responseData = await response.json();
                    this.events.emitEvent({
                        type: 'action_completed',
                        level: 'info',
                        data: {
                            actionName: actionName,
                            message: `Request completed successfully (${response.status})`
                        }
                    });
                    if (action.name && !hasCustomOutput) {
                        context.setOutput(`${action.name}.response`, responseData);
                        context.setOutput(`${action.name}.status`, response.status);
                        context.setOutput(`${action.name}.statusText`, response.statusText);
                    }
                }
                catch (error) {
                    this.events.emitEvent({
                        type: 'action_failed',
                        level: 'error',
                        data: {
                            actionName: actionName,
                            error: error instanceof Error ? error.message : String(error)
                        }
                    });
                    throw new Error(`Action "${actionName}" failed: ${error instanceof Error ? error.message : String(error)}`);
                }
                break;
            }
            default:
                throw new Error(`Unknown or unimplemented primitive action type: ${action.type}`);
        }
    }
    async verifyOnSinglePlatform(platform, contract, address, constructorArguments, network, actionName, contractName, action, context, hasCustomOutput = false) {
        const supportsNetwork = platform.supportsNetwork(network);
        if (!supportsNetwork) {
            this.events.emitEvent({
                type: 'action_skipped',
                level: 'info',
                data: {
                    actionName: actionName,
                    reason: `Network ${network.name} does not support ${platform.name} verification`
                }
            });
            return;
        }
        const isConfigured = platform.isConfigured();
        if (!isConfigured) {
            this.events.emitEvent({
                type: 'action_skipped',
                level: 'warn',
                data: {
                    actionName: actionName,
                    reason: `Verification skipped: ${platform.getConfigurationRequirements()}`
                }
            });
            return;
        }
        let buildInfoPath;
        for (const sourcePath of contract._sources) {
            if (sourcePath.includes('/build-info/') && sourcePath.endsWith('.json')) {
                buildInfoPath = sourcePath;
                break;
            }
        }
        if (!buildInfoPath) {
            throw new Error(`Action "${actionName}": No build-info file found in contract sources`);
        }
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        let buildInfoContent;
        try {
            buildInfoContent = await fs.readFile(buildInfoPath, 'utf-8');
        }
        catch (error) {
            throw new Error(`Action "${actionName}": Failed to read build info file at ${buildInfoPath}: ${error instanceof Error ? error.message : String(error)}`);
        }
        let buildInfo;
        try {
            buildInfo = JSON.parse(buildInfoContent);
        }
        catch (error) {
            throw new Error(`Action "${actionName}": Failed to parse build info JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.events.emitEvent({
            type: 'verification_started',
            level: 'info',
            data: {
                actionName: actionName,
                address,
                contractName,
                platform: platform.name,
                networkName: network.name
            }
        });
        try {
            const verificationResult = await platform.verifyContract({
                contract,
                buildInfo,
                address,
                constructorArguments,
                network
            });
            if (!verificationResult.success) {
                throw new Error(`Verification failed: ${verificationResult.message}`);
            }
            if (verificationResult.isAlreadyVerified) {
                this.events.emitEvent({
                    type: 'verification_completed',
                    level: 'info',
                    data: {
                        actionName: actionName,
                        address,
                        contractName,
                        platform: platform.name,
                        message: verificationResult.message
                    }
                });
            }
            else {
                this.events.emitEvent({
                    type: 'verification_submitted',
                    level: 'info',
                    data: {
                        actionName: actionName,
                        platform: platform.name,
                        guid: verificationResult.guid || 'N/A',
                        message: verificationResult.message
                    }
                });
                this.events.emitEvent({
                    type: 'verification_completed',
                    level: 'info',
                    data: {
                        actionName: actionName,
                        address,
                        contractName,
                        platform: platform.name,
                        message: 'Contract verified successfully'
                    }
                });
            }
            if (action.name && !hasCustomOutput) {
                context.setOutput(`${action.name}.verified`, true);
                if (verificationResult.guid) {
                    context.setOutput(`${action.name}.guid`, verificationResult.guid);
                }
            }
        }
        catch (error) {
            this.events.emitEvent({
                type: 'verification_failed',
                level: 'error',
                data: {
                    actionName: actionName,
                    address,
                    contractName,
                    platform: platform.name,
                    error: error instanceof Error ? error.message : String(error)
                }
            });
            throw error;
        }
    }
    async testNicksMethod(bytecode, context, gasPrice, gasLimit, fundingAmount) {
        let testResult = false;
        let eoaAddress;
        let wallet;
        try {
            const defaultGasPrice = gasPrice || ethers_1.ethers.parseUnits('100', 'gwei');
            const defaultGasLimit = gasLimit || 250000n;
            const calculatedCost = BigInt(defaultGasPrice.toString()) * BigInt(defaultGasLimit.toString());
            const defaultFundingAmount = fundingAmount || calculatedCost;
            const signer = await context.getResolvedSigner();
            const signerAddress = await signer.getAddress();
            const signerBalance = await context.provider.getBalance(signerAddress);
            if (signerBalance < BigInt(defaultFundingAmount.toString())) {
                this.events.emitEvent({
                    type: 'action_failed',
                    level: 'error',
                    data: {
                        message: `Insufficient funds: signer has ${ethers_1.ethers.formatEther(signerBalance)} ETH but needs ${ethers_1.ethers.formatEther(defaultFundingAmount)} ETH`
                    }
                });
                return false;
            }
            const result = await this.generateNicksMethodTransaction(bytecode, defaultGasPrice, defaultGasLimit);
            const { signedTx, unsignedTx } = result;
            eoaAddress = result.eoaAddress;
            wallet = result.wallet;
            try {
                const simulationTx = {
                    ...unsignedTx,
                    from: eoaAddress,
                };
                if (unsignedTx.gasPrice) {
                    const gasPrice = await context.provider.getFeeData().then(data => data.gasPrice);
                    if (!gasPrice) {
                        this.events.emitEvent({
                            type: "debug_info",
                            level: "debug",
                            data: {
                                message: `Legacy gas price not available.`,
                            },
                        });
                    }
                    else if (BigInt(unsignedTx.gasPrice.toString()) < gasPrice) {
                        this.events.emitEvent({
                            type: "debug_info",
                            level: "warn",
                            data: {
                                message: `Gas price (${unsignedTx.gasPrice}) is lower than the current gas price (${gasPrice}). This may cause the transaction to not be mined.`,
                            },
                        });
                    }
                }
                if (simulationTx.gasLimit) {
                    const estimatedGas = await context.provider.estimateGas(simulationTx);
                    const estimatedGasStr = estimatedGas.toString();
                    const simulationTxGasLimitStr = simulationTx.gasLimit.toString();
                    if (estimatedGas > BigInt(simulationTxGasLimitStr)) {
                        this.events.emitEvent({
                            type: "debug_info",
                            level: "warn",
                            data: {
                                message: `Estimated gas (${estimatedGasStr}) is greater than gas provided in the transaction (${simulationTxGasLimitStr}). This may cause the transaction to revert.`,
                            },
                        });
                    }
                    else {
                        this.events.emitEvent({
                            type: "debug_info",
                            level: "debug",
                            data: {
                                message: `Estimated gas: ${estimatedGasStr}, Gas provided: ${simulationTxGasLimitStr}`,
                            },
                        });
                    }
                }
            }
            catch (simulationError) {
                this.events.emitEvent({
                    type: "debug_info",
                    level: "warn",
                    data: {
                        message: `Simulation failed: ${simulationError instanceof Error
                            ? simulationError.message
                            : String(simulationError)}`,
                    },
                });
            }
            this.events.emitEvent({
                type: 'debug_info',
                level: 'debug',
                data: {
                    message: `Testing Nick's method with EOA: ${eoaAddress}`
                }
            });
            const currentBalance = await context.provider.getBalance(eoaAddress);
            const neededFunding = BigInt(defaultFundingAmount.toString()) - currentBalance;
            if (neededFunding > 0) {
                this.events.emitEvent({
                    type: 'transaction_sent',
                    level: 'debug',
                    data: {
                        to: eoaAddress,
                        value: neededFunding.toString(),
                        dataPreview: 'funding EOA for Nick\'s method test',
                        txHash: 'pending'
                    }
                });
                this.events.emitEvent({
                    type: 'debug_info',
                    level: 'debug',
                    data: {
                        message: `[NICK'S METHOD DEBUG] Sending funding transaction: ${ethers_1.ethers.formatEther(neededFunding)} ETH to ${eoaAddress}`
                    }
                });
                const signer = await context.getResolvedSigner();
                const fundingTx = await signer.sendTransaction({
                    to: eoaAddress,
                    value: neededFunding
                });
                this.events.emitEvent({
                    type: 'debug_info',
                    level: 'debug',
                    data: {
                        message: `[NICK'S METHOD DEBUG] Funding transaction sent: ${fundingTx.hash}, waiting for confirmation...`
                    }
                });
                const fundingReceipt = await fundingTx.wait();
                this.events.emitEvent({
                    type: 'transaction_confirmed',
                    level: 'debug',
                    data: {
                        txHash: fundingTx.hash,
                        blockNumber: fundingReceipt?.blockNumber || 0
                    }
                });
                this.events.emitEvent({
                    type: 'debug_info',
                    level: 'debug',
                    data: {
                        message: `[NICK'S METHOD DEBUG] Funded EOA ${eoaAddress} with ${ethers_1.ethers.formatEther(neededFunding)} ETH, receipt status: ${fundingReceipt?.status}`
                    }
                });
                if (!fundingReceipt || fundingReceipt.status !== 1) {
                    this.events.emitEvent({
                        type: 'action_failed',
                        level: 'error',
                        data: {
                            message: `[NICK'S METHOD DEBUG] Funding transaction failed! Hash: ${fundingTx.hash}, Status: ${fundingReceipt?.status}`
                        }
                    });
                    return false;
                }
            }
            else {
                this.events.emitEvent({
                    type: 'debug_info',
                    level: 'debug',
                    data: {
                        message: `[NICK'S METHOD DEBUG] EOA already has sufficient balance, skipping funding`
                    }
                });
            }
            this.events.emitEvent({
                type: 'debug_info',
                level: 'debug',
                data: {
                    message: `[NICK'S METHOD DEBUG] Broadcasting Nick's method transaction. RawTx: ${signedTx.substring(0, 100)}...`
                }
            });
            const deployTx = await context.provider.broadcastTransaction(signedTx);
            this.events.emitEvent({
                type: 'debug_info',
                level: 'debug',
                data: {
                    message: `[NICK'S METHOD DEBUG] Transaction broadcasted successfully. Hash: ${deployTx.hash}, waiting for confirmation...`
                }
            });
            const receipt = await deployTx.wait();
            this.events.emitEvent({
                type: 'debug_info',
                level: 'debug',
                data: {
                    message: `[NICK'S METHOD DEBUG] Transaction receipt received. Status: ${receipt?.status}, ContractAddress: ${receipt?.contractAddress}, BlockNumber: ${receipt?.blockNumber}`
                }
            });
            if (receipt && receipt.status === 1) {
                this.events.emitEvent({
                    type: 'transaction_confirmed',
                    level: 'info',
                    data: {
                        txHash: deployTx.hash,
                        blockNumber: receipt.blockNumber || 0
                    }
                });
                this.events.emitEvent({
                    type: 'debug_info',
                    level: 'debug',
                    data: {
                        message: `[NICK'S METHOD DEBUG] Nick's method test successful - contract deployed at ${receipt.contractAddress}`
                    }
                });
                testResult = true;
            }
            else {
                this.events.emitEvent({
                    type: 'action_failed',
                    level: 'error',
                    data: {
                        message: `[NICK'S METHOD DEBUG] Nick's method test failed - transaction reverted or failed. Hash: ${deployTx.hash}, Status: ${receipt?.status}`
                    }
                });
                testResult = false;
            }
        }
        catch (error) {
            this.events.emitEvent({
                type: 'action_failed',
                level: 'error',
                data: {
                    message: `[NICK'S METHOD DEBUG] Nick's method test failed with error: ${error instanceof Error ? error.message : String(error)}`
                }
            });
            if (error instanceof Error && error.stack) {
                this.events.emitEvent({
                    type: 'action_failed',
                    level: 'debug',
                    data: {
                        message: `[NICK'S METHOD DEBUG] Error stack trace: ${error.stack}`
                    }
                });
            }
            testResult = false;
        }
        finally {
            if (eoaAddress && wallet) {
                try {
                    await this.returnRemainingFunds(eoaAddress, wallet, context);
                }
                catch (error) {
                    this.events.emitEvent({
                        type: 'action_failed',
                        level: 'warn',
                        data: {
                            message: `Failed to return remaining funds from EOA ${eoaAddress}: ${error instanceof Error ? error.message : String(error)}`
                        }
                    });
                }
            }
        }
        return testResult;
    }
    async generateNicksMethodTransaction(bytecode, gasPrice, gasLimit) {
        const wallet = ethers_1.ethers.Wallet.createRandom();
        const unsignedTx = {
            type: 0,
            chainId: 0,
            nonce: 0,
            gasPrice: gasPrice,
            gasLimit: gasLimit,
            to: null,
            value: 0,
            data: bytecode
        };
        const signedTx = await wallet.signTransaction(unsignedTx);
        const parsedTx = ethers_1.ethers.Transaction.from(signedTx);
        const eoaAddress = parsedTx.from;
        return {
            unsignedTx,
            signedTx,
            eoaAddress,
            wallet,
        };
    }
    async returnRemainingFunds(eoaAddress, wallet, context) {
        const remainingBalance = await context.provider.getBalance(eoaAddress);
        if (remainingBalance <= 0n) {
            return;
        }
        const connectedWallet = wallet.connect(context.provider);
        const feeData = await context.provider.getFeeData();
        const txGas = feeData.maxFeePerGas ? {
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers_1.ethers.parseUnits('20', 'gwei')
        } : {
            gasPrice: feeData.gasPrice || undefined,
        };
        const effectiveGasPrice = txGas.maxFeePerGas || txGas.gasPrice;
        if (!effectiveGasPrice) {
            this.events.emitEvent({
                type: 'action_failed',
                level: 'error',
                data: {
                    message: `No gas price available`
                }
            });
            return;
        }
        const gasLimit = 21000n;
        const gasCost = effectiveGasPrice * gasLimit;
        if (remainingBalance <= gasCost) {
            this.events.emitEvent({
                type: 'action_info',
                level: 'debug',
                data: {
                    message: `Remaining balance ${ethers_1.ethers.formatEther(remainingBalance)} ETH is insufficient to cover gas costs for fund return`
                }
            });
            return;
        }
        const amountToSend = remainingBalance - gasCost;
        this.events.emitEvent({
            type: 'transaction_sent',
            level: 'debug',
            data: {
                to: await (await context.getResolvedSigner()).getAddress(),
                value: amountToSend.toString(),
                dataPreview: 'returning remaining funds from Nick\'s method test',
                txHash: 'pending'
            }
        });
        const returnTx = await connectedWallet.sendTransaction({
            to: await (await context.getResolvedSigner()).getAddress(),
            value: amountToSend,
            gasLimit: gasLimit,
            ...txGas,
        });
        await returnTx.wait();
        this.events.emitEvent({
            type: 'transaction_confirmed',
            level: 'debug',
            data: {
                txHash: returnTx.hash,
                blockNumber: (await returnTx.wait())?.blockNumber || 0
            }
        });
        this.events.emitEvent({
            type: 'debug_info',
            level: 'debug',
            data: {
                message: `Returned ${ethers_1.ethers.formatEther(amountToSend)} ETH from test EOA ${eoaAddress} to original wallet`
            }
        });
    }
    async retryBooleanCheck(checkFn, retries = 3, delayMs = 2000) {
        const milestones = new Set();
        const total = retries + 1;
        milestones.add(1);
        milestones.add(Math.max(1, Math.floor(total * 0.25)));
        milestones.add(Math.max(1, Math.floor(total * 0.5)));
        milestones.add(Math.max(1, Math.floor(total * 0.75)));
        milestones.add(total);
        for (let attempt = 0; attempt < total; attempt++) {
            try {
                const result = await checkFn();
                if (result) {
                    return true;
                }
                if (milestones.has(attempt + 1)) {
                    this.events.emitEvent({
                        type: 'debug_info',
                        level: 'debug',
                        data: {
                            message: `Post-execution check returned false (attempt ${attempt + 1}/${total}).`
                        }
                    });
                }
            }
            catch (err) {
                if (milestones.has(attempt + 1)) {
                    this.events.emitEvent({
                        type: 'debug_info',
                        level: 'debug',
                        data: {
                            message: `Post-execution check threw error (attempt ${attempt + 1}/${total}): ${err instanceof Error ? err.message : String(err)}`
                        }
                    });
                }
            }
            if (attempt < retries) {
                await new Promise(res => setTimeout(res, delayMs));
            }
        }
        return false;
    }
    async evaluateSkipConditions(conditions, context, scope) {
        if (!conditions || conditions.length === 0) {
            return false;
        }
        for (const condition of conditions) {
            const shouldSkip = await this.resolver.resolve(condition, context, scope);
            if (shouldSkip) {
                return true;
            }
        }
        return false;
    }
    topologicalSortActions(job) {
        const sorted = [];
        const graph = new Map();
        const inDegree = new Map();
        const actionMap = new Map(job.actions.map(a => [a.name, a]));
        for (const action of job.actions) {
            graph.set(action.name, new Set(action.depends_on || []));
            inDegree.set(action.name, 0);
        }
        for (const [actionName, dependencies] of graph.entries()) {
            for (const depName of dependencies) {
                if (!actionMap.has(depName)) {
                    throw new Error(`Action "${actionName}" in job "${job.name}" has an invalid dependency on "${depName}", which does not exist.`);
                }
                inDegree.set(actionName, (inDegree.get(actionName) ?? 0) + 1);
            }
        }
        const queue = Array.from(inDegree.entries())
            .filter(([, degree]) => degree === 0)
            .map(([name]) => name);
        while (queue.length > 0) {
            const currentName = queue.shift();
            sorted.push(currentName);
            for (const [actionName, dependencies] of graph.entries()) {
                if (dependencies.has(currentName)) {
                    const newDegree = (inDegree.get(actionName) ?? 1) - 1;
                    inDegree.set(actionName, newDegree);
                    if (newDegree === 0) {
                        queue.push(actionName);
                    }
                }
            }
        }
        if (sorted.length !== job.actions.length) {
            throw new Error(`Circular dependency detected among actions in job "${job.name}".`);
        }
        return sorted;
    }
    async checkFundsForTransaction(actionName, txParams, context, signer) {
        try {
            const gasPrice = txParams.gasPrice || await context.provider.getFeeData().then(data => data.gasPrice);
            if (!gasPrice) {
                this.events.emitEvent({
                    type: 'debug_info',
                    level: 'warn',
                    data: {
                        actionName: actionName,
                        message: `No gas price available`
                    }
                });
                return null;
            }
            const gasLimit = txParams.gasLimit || await signer.estimateGas(txParams);
            const requiredETH = BigInt(gasLimit) * BigInt(gasPrice);
            const signerBalance = await context.provider.getBalance(await signer.getAddress());
            this.events.emitEvent({
                type: 'debug_info',
                level: 'debug',
                data: {
                    actionName: actionName,
                    message: `Transaction ${txParams.gasLimit ? 'set' : 'estimated'} gas limit: ${gasLimit}, ${txParams.gasPrice ? 'set' : 'estimated'} gas price: ${ethers_1.ethers.formatUnits(gasPrice, 'gwei')} gwei, required ETH: ${ethers_1.ethers.formatEther(requiredETH)}`
                }
            });
            if (signerBalance < requiredETH) {
                this.events.emitEvent({
                    type: 'debug_info',
                    level: 'warn',
                    data: {
                        actionName: actionName,
                        message: `Insufficient funds: signer has ${ethers_1.ethers.formatEther(signerBalance)} ETH but estimated cost is ${ethers_1.ethers.formatEther(requiredETH)} ETH`
                    }
                });
                return false;
            }
            else {
                return true;
            }
        }
        catch (error) {
            this.events.emitEvent({
                type: 'debug_info',
                level: 'warn',
                data: {
                    actionName: actionName,
                    message: "Error checking signer balance: " + (error instanceof Error ? error.message : String(error))
                }
            });
        }
        return null;
    }
    getVerificationWarnings() {
        return [...this.verificationWarnings];
    }
    clearVerificationWarnings() {
        this.verificationWarnings = [];
    }
}
exports.ExecutionEngine = ExecutionEngine;
//# sourceMappingURL=engine.js.map