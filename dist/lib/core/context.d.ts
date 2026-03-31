import { ethers } from 'ethers';
import { Network } from '../types';
import { ContractRepository } from '../contracts/repository';
export declare class ExecutionContext {
    readonly provider: ethers.JsonRpcProvider;
    readonly signer: ethers.Signer | Promise<ethers.Signer>;
    readonly contractRepository: ContractRepository;
    private outputs;
    private network;
    private etherscanApiKey?;
    private currentContextPath?;
    private resolvedSigner?;
    private topLevelConstants;
    private jobConstants;
    constructor(network: Network, privateKey: string | undefined, contractRepository: ContractRepository, etherscanApiKey?: string, topLevelConstants?: Map<string, any>);
    getResolvedSigner(): Promise<ethers.Signer>;
    getNetwork(): Network;
    getEtherscanApiKey(): string | undefined;
    getContractRepository(): ContractRepository;
    setOutput(key: string, value: any): void;
    getOutput(key: string): any;
    getOutputs(): Map<string, any>;
    setContextPath(path?: string): void;
    getContextPath(): string | undefined;
    setJobConstants(constants?: Record<string, any>): void;
    getConstant(name: string): any | undefined;
    dispose(): Promise<void>;
}
//# sourceMappingURL=context.d.ts.map