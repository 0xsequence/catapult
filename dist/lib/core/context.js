"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionContext = void 0;
const ethers_1 = require("ethers");
class ExecutionContext {
    constructor(network, privateKey, contractRepository, etherscanApiKey, topLevelConstants) {
        this.outputs = new Map();
        this.topLevelConstants = new Map();
        this.jobConstants = new Map();
        this.network = network;
        this.provider = new ethers_1.ethers.JsonRpcProvider(network.rpcUrl);
        this.contractRepository = contractRepository;
        this.etherscanApiKey = etherscanApiKey;
        if (topLevelConstants) {
            this.topLevelConstants = new Map(topLevelConstants);
        }
        if (privateKey) {
            this.signer = new ethers_1.ethers.NonceManager(new ethers_1.ethers.Wallet(privateKey, this.provider));
        }
        else if (network.rpcUrl) {
            this.signer = this.provider.getSigner().then(signer => new ethers_1.ethers.NonceManager(signer));
        }
        else {
            throw new Error('A private key must be provided or an RPC URL must be configured to obtain a signer for the network.');
        }
    }
    async getResolvedSigner() {
        if (this.resolvedSigner) {
            return this.resolvedSigner;
        }
        if (this.signer instanceof Promise) {
            this.resolvedSigner = await this.signer;
            return this.resolvedSigner;
        }
        else {
            this.resolvedSigner = this.signer;
            return this.resolvedSigner;
        }
    }
    getNetwork() {
        return this.network;
    }
    getEtherscanApiKey() {
        return this.etherscanApiKey;
    }
    getContractRepository() {
        return this.contractRepository;
    }
    setOutput(key, value) {
        this.outputs.set(key, value);
    }
    getOutput(key) {
        if (!this.outputs.has(key)) {
            throw new Error(`Output for key "${key}" not found in context. Check dependencies.`);
        }
        return this.outputs.get(key);
    }
    getOutputs() {
        return this.outputs;
    }
    setContextPath(path) {
        this.currentContextPath = path;
    }
    getContextPath() {
        return this.currentContextPath;
    }
    setJobConstants(constants) {
        this.jobConstants = new Map(Object.entries(constants || {}));
    }
    getConstant(name) {
        if (this.jobConstants.has(name))
            return this.jobConstants.get(name);
        if (this.topLevelConstants.has(name))
            return this.topLevelConstants.get(name);
        return undefined;
    }
    async dispose() {
        try {
            if (this.provider.destroy) {
                await this.provider.destroy();
            }
        }
        catch (error) {
        }
    }
}
exports.ExecutionContext = ExecutionContext;
//# sourceMappingURL=context.js.map