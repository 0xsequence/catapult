import { Command } from 'commander';
import { ProjectLoader, ProjectLoaderOptions } from '../lib/core/loader';
export declare const projectOption: (cmd: Command) => Command;
export declare const dotenvOption: (cmd: Command) => Command;
export declare const noStdOption: (cmd: Command) => Command;
export declare const verbosityOption: (cmd: Command) => Command;
export declare function loadProject(projectRoot: string, options?: ProjectLoaderOptions): Promise<ProjectLoader>;
export declare function loadDotenv(options: {
    dotenv?: string;
}): void;
//# sourceMappingURL=common.d.ts.map