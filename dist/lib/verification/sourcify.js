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
exports.SourcifyVerificationPlatform = void 0;
class SourcifyVerificationPlatform {
    constructor() {
        this.name = 'sourcify';
    }
    supportsNetwork(network) {
        return Array.isArray(network.supports) && network.supports.includes(this.name);
    }
    isConfigured() {
        return true;
    }
    getConfigurationRequirements() {
        return 'Sourcify requires no configuration';
    }
    async isContractAlreadyVerified(address, network) {
        try {
            const response = await fetch(`https://sourcify.dev/server/check-by-addresses?addresses=${address}&chainIds=${network.chainId}`, {
                method: 'GET',
                signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
                return false;
            }
            const data = await response.json();
            return Array.isArray(data) && data.some(item => item.address?.toLowerCase() === address.toLowerCase() &&
                item.chainId === network.chainId.toString() &&
                (item.status === 'perfect' || item.status === 'partial'));
        }
        catch (error) {
            console.warn(`Failed to check Sourcify verification status for ${address}: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    async verifyContract(request) {
        const { contract, buildInfo, address, network } = request;
        const alreadyVerified = await this.isContractAlreadyVerified(address, network);
        if (alreadyVerified) {
            return {
                success: true,
                message: 'Contract was already verified on Sourcify (checked before attempting verification)',
                isAlreadyVerified: true
            };
        }
        try {
            const { metadata, sourceFiles } = await this.createVerificationData(contract, buildInfo);
            const formData = new FormData();
            formData.append('address', address);
            formData.append('chain', network.chainId.toString());
            const metadataJson = JSON.stringify(metadata, null, 2);
            const metadataBlob = new Blob([metadataJson], { type: 'application/json' });
            formData.append('files', metadataBlob, 'metadata.json');
            for (const [sourcePath, sourceContent] of sourceFiles) {
                const sourceBlob = new Blob([sourceContent], { type: 'text/plain' });
                formData.append('files', sourceBlob, sourcePath);
            }
            const response = await fetch('https://sourcify.dev/server/verify', {
                method: 'POST',
                body: formData,
                signal: AbortSignal.timeout(60000),
            });
            if (!response.ok) {
                let responseText = '';
                try {
                    responseText = await response.text();
                }
                catch {
                }
                if (response.status === 409) {
                    const lower = `${response.statusText} ${responseText}`.toLowerCase();
                    if (lower.includes('already partially verified') ||
                        lower.includes('partial match') ||
                        lower.includes('partial')) {
                        return {
                            success: true,
                            message: 'Contract already partially verified on Sourcify (no further action needed)',
                            isAlreadyVerified: true
                        };
                    }
                }
                let errorDetails = `HTTP ${response.status}: ${response.statusText}`;
                if (responseText) {
                    errorDetails += ` - ${responseText}`;
                }
                return {
                    success: false,
                    message: `Sourcify API request failed: ${errorDetails}`
                };
            }
            const result = await response.json();
            if (result.result && Array.isArray(result.result)) {
                const perfectMatch = result.result.find((item) => item.status === 'perfect');
                const partialMatch = result.result.find((item) => item.status === 'partial');
                if (perfectMatch || partialMatch) {
                    const matchType = perfectMatch ? 'perfect' : 'partial';
                    return {
                        success: true,
                        message: `Contract verified successfully on Sourcify (${matchType} match)`
                    };
                }
                return {
                    success: false,
                    message: 'Sourcify verification failed - no perfect or partial match found'
                };
            }
            else if (result.status) {
                if (result.status === 'perfect' || result.status === 'partial') {
                    return {
                        success: true,
                        message: `Contract verified successfully on Sourcify (status: ${result.status})`
                    };
                }
                else if (result.status === 'error') {
                    return {
                        success: false,
                        message: result.message || 'Sourcify verification failed with unknown error'
                    };
                }
                else {
                    return {
                        success: false,
                        message: `Sourcify verification failed with status: ${result.status}`
                    };
                }
            }
            else {
                return {
                    success: false,
                    message: `Sourcify verification failed - unexpected response format: ${JSON.stringify(result)}`
                };
            }
        }
        catch (error) {
            return {
                success: false,
                message: `Sourcify verification failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    async createVerificationData(contract, buildInfo) {
        const sourceFiles = [];
        for (const [sourcePath, sourceInfo] of Object.entries(buildInfo.input.sources)) {
            if (sourceInfo.content) {
                sourceFiles.push([sourcePath, sourceInfo.content]);
            }
        }
        let metadata = null;
        try {
            const sources = Array.from(contract._sources);
            const artifactPath = sources.find((source) => source.includes('/artifacts/') && source.endsWith('.json') && !source.includes('/build-info/'));
            if (artifactPath) {
                const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
                const artifactContent = await fs.readFile(artifactPath, 'utf-8');
                const artifact = JSON.parse(artifactContent);
                if (artifact.rawMetadata) {
                    metadata = JSON.parse(artifact.rawMetadata);
                }
                else if (artifact.metadata) {
                    metadata = artifact.metadata;
                }
            }
        }
        catch (error) {
            console.warn(`Failed to load artifact metadata: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!metadata && buildInfo.output?.contracts?.[contract.sourceName]?.[contract.contractName]?.metadata) {
            const metadataField = buildInfo.output.contracts[contract.sourceName][contract.contractName].metadata;
            metadata = typeof metadataField === 'string' ? JSON.parse(metadataField) : metadataField;
        }
        if (!metadata) {
            metadata = {
                compiler: {
                    version: buildInfo.solcLongVersion || buildInfo.solcVersion
                },
                language: buildInfo.input.language,
                output: {
                    abi: buildInfo.output?.contracts?.[contract.sourceName]?.[contract.contractName]?.abi || [],
                    devdoc: { kind: 'dev', methods: {}, version: 1 },
                    userdoc: { kind: 'user', methods: {}, version: 1 }
                },
                settings: buildInfo.input.settings,
                sources: buildInfo.input.sources,
                version: 1
            };
        }
        if (!metadata?.settings?.compilationTarget) {
            console.warn('Warning: Metadata missing compilation target');
        }
        return { metadata, sourceFiles };
    }
}
exports.SourcifyVerificationPlatform = SourcifyVerificationPlatform;
//# sourceMappingURL=sourcify.js.map