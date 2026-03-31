import { Job, Template, Condition } from '../types';
import { ExecutionContext } from './context';
import { ResolutionScope } from './resolver';
import { DeploymentEventEmitter } from '../events';
import { VerificationPlatformRegistry } from '../verification/etherscan';
export type EngineOptions = {
    eventEmitter?: DeploymentEventEmitter;
    verificationRegistry?: VerificationPlatformRegistry;
    noPostCheckConditions?: boolean;
    allowMultipleNicksMethodTests?: boolean;
    ignoreVerifyErrors?: boolean;
};
export declare class ExecutionEngine {
    private readonly resolver;
    private readonly templates;
    private readonly events;
    private readonly verificationRegistry;
    private readonly noPostCheckConditions;
    private readonly allowMultipleNicksMethodTests;
    private readonly ignoreVerifyErrors;
    private nicksMethodResult;
    private verificationWarnings;
    constructor(templates: Map<string, Template>, options?: EngineOptions);
    private getPostCheckRetryConfig;
    executeJob(job: Job, context: ExecutionContext): Promise<void>;
    private executeAction;
    private executeTemplate;
    private executePrimitive;
    private verifyOnSinglePlatform;
    private testNicksMethod;
    private generateNicksMethodTransaction;
    private returnRemainingFunds;
    private retryBooleanCheck;
    evaluateSkipConditions(conditions: Condition[] | undefined, context: ExecutionContext, scope: ResolutionScope): Promise<boolean>;
    private topologicalSortActions;
    private checkFundsForTransaction;
    getVerificationWarnings(): Array<{
        actionName: string;
        address: string;
        contractName: string;
        platform: string;
        error: string;
        jobName?: string;
        networkName?: string;
    }>;
    clearVerificationWarnings(): void;
}
//# sourceMappingURL=engine.d.ts.map