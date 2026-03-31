import { ProjectLoaderOptions } from './core/loader';
import { Network } from './types';
import { DeploymentEventEmitter } from './events';
export interface DeployerOptions {
    projectRoot: string;
    privateKey?: string;
    networks: Network[];
    runJobs?: string[];
    runOnNetworks?: number[];
    eventEmitter?: DeploymentEventEmitter;
    loaderOptions?: ProjectLoaderOptions;
    etherscanApiKey?: string;
    failEarly?: boolean;
    noPostCheckConditions?: boolean;
    flatOutput?: boolean;
    runDeprecated?: boolean;
    showSummary?: boolean;
    ignoreVerifyErrors?: boolean;
}
export declare class Deployer {
    private readonly options;
    readonly events: DeploymentEventEmitter;
    private readonly loader;
    private readonly noPostCheckConditions;
    private readonly showSummary;
    private readonly results;
    private graph?;
    constructor(options: DeployerOptions);
    run(): Promise<void>;
    private emitRunSummary;
    private emitVerificationWarningsReport;
    private getJobExecutionPlan;
    private getTargetNetworks;
    private shouldSkipJobOnNetwork;
    private normalizeEvmVersion;
    private compareEvmVersions;
    private populateContextWithDependentJobOutputs;
    private writeOutputFiles;
    private filterOutputsByActionFlags;
    private filterOutDependencyOutputs;
    private groupNetworkResults;
}
//# sourceMappingURL=deployer.d.ts.map