"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationPlatformRegistry = exports.EtherscanVerificationPlatform = void 0;
exports.isContractAlreadyVerified = isContractAlreadyVerified;
exports.submitVerification = submitVerification;
exports.checkVerificationStatus = checkVerificationStatus;
exports.waitForVerification = waitForVerification;
exports.createDefaultVerificationRegistry = createDefaultVerificationRegistry;
function isContractNotFoundError(message) {
    return message.toLowerCase().includes('unable to locate contractcode') ||
        message.toLowerCase().includes('contract source code not verified') ||
        message.toLowerCase().includes('contract not found');
}
function isAlreadyVerifiedError(message) {
    return message.toLowerCase().includes('already verified') ||
        message.toLowerCase().includes('contract source code already verified');
}
function getFullCompilerVersion(buildInfo) {
    for (const [sourceName, contracts] of Object.entries(buildInfo.output.contracts)) {
        for (const [contractName, contract] of Object.entries(contracts)) {
            if (contract.metadata) {
                try {
                    const metadata = JSON.parse(contract.metadata);
                    if (metadata.compiler?.version) {
                        return metadata.compiler.version;
                    }
                }
                catch (error) {
                    continue;
                }
            }
        }
    }
    return buildInfo.solcLongVersion || buildInfo.solcVersion;
}
function getEtherscanApiUrl(chainId) {
    return `https://api.etherscan.io/v2/api?chainid=${chainId}`;
}
async function isContractAlreadyVerified(address, apiKey, network) {
    const apiUrl = getEtherscanApiUrl(network.chainId);
    const params = new URLSearchParams({
        module: 'contract',
        action: 'getsourcecode',
        address: address,
        apikey: apiKey
    });
    try {
        const response = await fetch(`${apiUrl}&${params.toString()}`, {
            method: 'GET',
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
            const sourceCode = data.result[0]?.SourceCode;
            return !!(sourceCode && sourceCode.length > 0);
        }
        return false;
    }
    catch (error) {
        console.warn(`Failed to check verification status for ${address}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
async function submitVerificationAttempt(request, apiKey) {
    const apiUrl = getEtherscanApiUrl(request.network.chainId);
    const contractName = `${request.contract.sourceName}:${request.contract.contractName}`;
    const cleanedInput = {
        language: request.buildInfo.input.language,
        sources: request.buildInfo.input.sources,
        settings: {
            ...(request.buildInfo.input.settings.optimizer && { optimizer: request.buildInfo.input.settings.optimizer }),
            ...(request.buildInfo.input.settings.evmVersion && { evmVersion: request.buildInfo.input.settings.evmVersion }),
            ...(request.buildInfo.input.settings.remappings && { remappings: request.buildInfo.input.settings.remappings }),
            ...(request.buildInfo.input.settings.viaIR && { viaIR: request.buildInfo.input.settings.viaIR }),
            ...(request.buildInfo.input.settings.libraries && { libraries: request.buildInfo.input.settings.libraries }),
            outputSelection: request.buildInfo.input.settings.outputSelection,
            ...(request.buildInfo.input.settings.metadata && { metadata: request.buildInfo.input.settings.metadata })
        }
    };
    const sourceCode = JSON.stringify(cleanedInput);
    const fullCompilerVersion = getFullCompilerVersion(request.buildInfo);
    const formData = new URLSearchParams({
        module: 'contract',
        action: 'verifysourcecode',
        codeformat: 'solidity-standard-json-input',
        sourceCode,
        contractaddress: request.address,
        contractname: contractName,
        compilerversion: `v${fullCompilerVersion}`,
        apikey: apiKey,
    });
    if (request.constructorArguments) {
        const constructorArgs = request.constructorArguments.startsWith('0x')
            ? request.constructorArguments.slice(2)
            : request.constructorArguments;
        formData.append('constructorArguements', constructorArgs);
    }
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.status === '1') {
        return {
            success: true,
            guid: data.result,
            message: 'Verification submitted successfully'
        };
    }
    else {
        const errorMessage = data.result || 'Unknown error occurred';
        if (isAlreadyVerifiedError(errorMessage)) {
            return {
                success: true,
                message: 'Contract is already verified'
            };
        }
        return {
            success: false,
            message: errorMessage
        };
    }
}
async function submitVerification(request, apiKey, eventEmitter) {
    const maxRetries = request.maxRetries ?? 3;
    const retryDelayMs = request.retryDelayMs ?? 5000;
    let lastError = '';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await submitVerificationAttempt(request, apiKey);
            if (result.success || !isContractNotFoundError(result.message)) {
                return result;
            }
            lastError = result.message;
            if (attempt === maxRetries) {
                break;
            }
            if (eventEmitter) {
                eventEmitter.emitEvent({
                    type: 'verification_retry',
                    level: 'info',
                    data: {
                        platform: 'etherscan_v2',
                        attempt: attempt + 1,
                        maxRetries: maxRetries + 1,
                        error: lastError
                    }
                });
            }
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (isContractNotFoundError(errorMessage) && attempt < maxRetries) {
                lastError = errorMessage;
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                continue;
            }
            return {
                success: false,
                message: `API request failed: ${errorMessage}`
            };
        }
    }
    return {
        success: false,
        message: `Verification failed after ${maxRetries + 1} attempts. Last error: ${lastError}`
    };
}
async function checkVerificationStatus(guid, apiKey, network) {
    const apiUrl = getEtherscanApiUrl(network.chainId);
    const params = new URLSearchParams({
        module: 'contract',
        action: 'checkverifystatus',
        guid,
        apikey: apiKey
    });
    try {
        const response = await fetch(`${apiUrl}&${params.toString()}`, {
            method: 'GET',
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        if (data.status === '1') {
            return {
                isComplete: true,
                isSuccess: true,
                message: 'Verification successful'
            };
        }
        else if (data.status === '0') {
            const result = data.result || '';
            if (result.includes('Pending')) {
                return {
                    isComplete: false,
                    isSuccess: false,
                    message: 'Verification pending'
                };
            }
            else if (isAlreadyVerifiedError(result)) {
                return {
                    isComplete: true,
                    isSuccess: true,
                    message: 'Contract is already verified'
                };
            }
            else {
                return {
                    isComplete: true,
                    isSuccess: false,
                    message: result || 'Verification failed'
                };
            }
        }
        else {
            return {
                isComplete: true,
                isSuccess: false,
                message: data.result || 'Unknown verification status'
            };
        }
    }
    catch (error) {
        throw new Error(`Failed to check verification status: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function waitForVerification(guid, apiKey, network, timeoutMs = 300000) {
    const startTime = Date.now();
    const pollInterval = 5000;
    while (Date.now() - startTime < timeoutMs) {
        const status = await checkVerificationStatus(guid, apiKey, network);
        if (status.isComplete) {
            return status;
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    throw new Error(`Verification timed out after ${timeoutMs / 1000} seconds`);
}
class EtherscanVerificationPlatform {
    constructor(apiKey) {
        this.name = 'etherscan_v2';
        this.apiKey = apiKey;
    }
    supportsNetwork(network) {
        return Array.isArray(network.supports) && network.supports.includes(this.name);
    }
    isConfigured() {
        return !!this.apiKey;
    }
    getConfigurationRequirements() {
        return 'Etherscan API key is required. Set --etherscan-api-key or ETHERSCAN_API_KEY environment variable.';
    }
    async isContractAlreadyVerified(address, network) {
        if (!this.apiKey) {
            throw new Error('Etherscan API key not configured');
        }
        return isContractAlreadyVerified(address, this.apiKey, network);
    }
    async verifyContract(request) {
        if (!this.apiKey) {
            throw new Error('Etherscan API key not configured');
        }
        const alreadyVerified = await this.isContractAlreadyVerified(request.address, request.network);
        if (alreadyVerified) {
            return {
                success: true,
                message: 'Contract was already verified (checked before attempting verification)',
                isAlreadyVerified: true
            };
        }
        const verificationResult = await submitVerification(request, this.apiKey);
        if (!verificationResult.success) {
            return verificationResult;
        }
        if (verificationResult.guid) {
            const verificationStatus = await waitForVerification(verificationResult.guid, this.apiKey, request.network);
            if (!verificationStatus.isSuccess) {
                return {
                    success: false,
                    message: `Verification failed: ${verificationStatus.message}`
                };
            }
            return {
                success: true,
                guid: verificationResult.guid,
                message: 'Contract verified successfully'
            };
        }
        else {
            return {
                success: true,
                message: 'Contract was already verified',
                isAlreadyVerified: true
            };
        }
    }
}
exports.EtherscanVerificationPlatform = EtherscanVerificationPlatform;
class VerificationPlatformRegistry {
    constructor() {
        this.platforms = new Map();
    }
    register(platform) {
        this.platforms.set(platform.name, platform);
    }
    get(platformName) {
        return this.platforms.get(platformName);
    }
    getAll() {
        return Array.from(this.platforms.values());
    }
    getSupportedPlatforms(network) {
        return this.getAll().filter(platform => platform.supportsNetwork(network));
    }
    getConfiguredPlatforms(network) {
        return this.getSupportedPlatforms(network).filter(platform => platform.isConfigured());
    }
}
exports.VerificationPlatformRegistry = VerificationPlatformRegistry;
function createDefaultVerificationRegistry(etherscanApiKey) {
    const registry = new VerificationPlatformRegistry();
    registry.register(new EtherscanVerificationPlatform(etherscanApiKey));
    const { SourcifyVerificationPlatform } = require('./sourcify');
    registry.register(new SourcifyVerificationPlatform());
    return registry;
}
//# sourceMappingURL=etherscan.js.map