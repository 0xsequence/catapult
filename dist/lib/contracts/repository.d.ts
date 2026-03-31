import { Contract } from '../types/contracts';
export declare class ContractRepository {
    private contracts;
    private referenceMap;
    private ambiguousReferences;
    loadFrom(projectRoot: string): Promise<void>;
    private parseAndHydrateFromFile;
    private hydrateContract;
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
        _path: string;
        _hash: string;
    }): void;
    private findContractFiles;
}
//# sourceMappingURL=repository.d.ts.map