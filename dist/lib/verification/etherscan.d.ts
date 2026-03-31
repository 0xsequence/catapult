import { Network } from '../types/network';
import { BuildInfo } from '../types/buildinfo';
import { Contract } from '../types/contracts';
import { DeploymentEventEmitter } from '../events/emitter';
export interface VerificationPlatform {
    readonly name: string;
    supportsNetwork(network: Network): boolean;
    isConfigured(): boolean;
    getConfigurationRequirements(): string;
    isContractAlreadyVerified(address: string, network: Network): Promise<boolean>;
    verifyContract(request: VerificationRequest): Promise<VerificationResult>;
}
export interface VerificationRequest {
    contract: Contract;
    buildInfo: BuildInfo;
    address: string;
    constructorArguments?: string;
    network: Network;
    maxRetries?: number;
    retryDelayMs?: number;
}
export interface VerificationResult {
    success: boolean;
    guid?: string;
    message: string;
    isAlreadyVerified?: boolean;
}
export interface VerificationStatus {
    isComplete: boolean;
    isSuccess: boolean;
    message: string;
}
export declare function isContractAlreadyVerified(address: string, apiKey: string, network: Network): Promise<boolean>;
export declare function submitVerification(request: VerificationRequest, apiKey: string, eventEmitter?: DeploymentEventEmitter): Promise<VerificationResult>;
export declare function checkVerificationStatus(guid: string, apiKey: string, network: Network): Promise<VerificationStatus>;
export declare function waitForVerification(guid: string, apiKey: string, network: Network, timeoutMs?: number): Promise<VerificationStatus>;
export declare class EtherscanVerificationPlatform implements VerificationPlatform {
    readonly name = "etherscan_v2";
    private apiKey?;
    constructor(apiKey?: string);
    supportsNetwork(network: Network): boolean;
    isConfigured(): boolean;
    getConfigurationRequirements(): string;
    isContractAlreadyVerified(address: string, network: Network): Promise<boolean>;
    verifyContract(request: VerificationRequest): Promise<VerificationResult>;
}
export declare class VerificationPlatformRegistry {
    private platforms;
    register(platform: VerificationPlatform): void;
    get(platformName: string): VerificationPlatform | undefined;
    getAll(): VerificationPlatform[];
    getSupportedPlatforms(network: Network): VerificationPlatform[];
    getConfiguredPlatforms(network: Network): VerificationPlatform[];
}
export declare function createDefaultVerificationRegistry(etherscanApiKey?: string): VerificationPlatformRegistry;
//# sourceMappingURL=etherscan.d.ts.map