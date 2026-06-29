import { Contract } from '../types/contracts';
import { SourceProvenance } from '../types/source';
export declare class ContractRepository {
    private contracts;
    private referenceMap;
    private ambiguousReferences;
    private sourceProvenanceByBuildInfoPath;
    loadFrom(projectRoot: string): Promise<void>;
    private parseAndHydrateFromFile;
    private hydrateContract;
    private getSourceProvenance;
    private selectPreferredSourceProvenance;
    disambiguateReferences(): void;
    lookup(reference: string, contextPath?: string): Contract | null;
    getAll(): Contract[];
    getAmbiguousReferences(): string[];
    addForTesting(contractData: {
        contractName: string;
        abi: any[];
        bytecode: string;
        deployedBytecode?: string;
        sourceName?: string;
        source?: string;
        compiler?: any;
        buildInfoId?: string;
        sourceProvenance?: SourceProvenance;
        _path: string;
        _hash: string;
    }): void;
    private findProjectFiles;
    private loadSourceProvenanceFiles;
    private pathExists;
    private warnSourceProvenance;
}
//# sourceMappingURL=repository.d.ts.map