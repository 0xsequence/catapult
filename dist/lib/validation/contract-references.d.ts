import { ProjectLoader } from '../core/loader';
export interface MissingContractReference {
    reference: string;
    location: string;
}
export interface UsedContractReference {
    reference: string;
    location: string;
}
export declare function extractUsedContractReferences(loader: ProjectLoader): Promise<UsedContractReference[]>;
export declare function validateContractReferences(loader: ProjectLoader): Promise<MissingContractReference[]>;
//# sourceMappingURL=contract-references.d.ts.map