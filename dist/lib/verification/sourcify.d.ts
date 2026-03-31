import { Network } from '../types/network';
import { VerificationPlatform, VerificationRequest, VerificationResult } from './etherscan';
export declare class SourcifyVerificationPlatform implements VerificationPlatform {
    readonly name = "sourcify";
    supportsNetwork(network: Network): boolean;
    isConfigured(): boolean;
    getConfigurationRequirements(): string;
    isContractAlreadyVerified(address: string, network: Network): Promise<boolean>;
    verifyContract(request: VerificationRequest): Promise<VerificationResult>;
    private createVerificationData;
}
//# sourceMappingURL=sourcify.d.ts.map