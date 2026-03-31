import { Job, Template } from '../types';
export declare class DependencyGraph {
    private readonly jobs;
    private readonly templates;
    private graph;
    private executionOrder;
    private allJobNames;
    constructor(jobs: Map<string, Job>, templates: Map<string, Template>);
    getExecutionOrder(): string[];
    getDependencies(jobName: string): Set<string>;
    private build;
    private findAllDependencies;
    private findTemplateSetupDependencies;
    private checkForCycles;
    private findPath;
    private topologicalSort;
}
//# sourceMappingURL=graph.d.ts.map