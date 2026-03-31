import { Job, Template } from '../types';
import { ContractRepository } from '../contracts/repository';
export interface ProjectLoaderOptions {
    loadStdTemplates?: boolean;
}
export declare class ProjectLoader {
    private readonly projectRoot;
    private readonly options;
    jobs: Map<string, Job>;
    templates: Map<string, Template>;
    readonly contractRepository: ContractRepository;
    constants: Map<string, any>;
    private constantSources;
    constructor(projectRoot: string, options?: ProjectLoaderOptions);
    load(): Promise<void>;
    private loadTemplatesFromDir;
    private findTemplateFiles;
    private loadJobsFromDir;
    private findJobFiles;
    private loadTemplatesFromJobDirs;
    private findAndLoadTemplatesInJobDirs;
    private loadConstantsFromDir;
    private pathExists;
}
//# sourceMappingURL=loader.d.ts.map