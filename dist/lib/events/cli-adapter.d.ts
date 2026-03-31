import { DeploymentEventEmitter } from './emitter';
export type VerbosityLevel = 0 | 1 | 2 | 3;
export declare class CLIEventAdapter {
    private emitter;
    private verbosity;
    constructor(emitter: DeploymentEventEmitter, verbosity?: VerbosityLevel);
    setVerbosity(verbosity: VerbosityLevel): void;
    private setupListeners;
    private getEventVerbosityLevel;
    private handleEvent;
    destroy(): void;
}
//# sourceMappingURL=cli-adapter.d.ts.map