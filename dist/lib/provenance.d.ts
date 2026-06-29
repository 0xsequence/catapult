import { BuildInfoSourceProvenance } from './types/source';
export interface SourceProvenanceEntry {
    sourceDocumentPath: string;
    buildInfoRef: string;
    buildInfoPath: string;
    provenance: BuildInfoSourceProvenance;
}
export interface CollectProvenanceOptions {
    jobs?: string[];
    includeDependencies?: boolean;
    loadStdTemplates?: boolean;
}
export interface ProvenanceOperationOptions extends CollectProvenanceOptions {
    force?: boolean;
}
export type ProvenanceOperationStatus = 'verified' | 'generated' | 'skipped' | 'failed';
export interface ProvenanceOperationResult {
    entry: SourceProvenanceEntry;
    status: ProvenanceOperationStatus;
    message: string;
    generatedBuildInfoPath?: string;
}
export interface ProvenanceRunResult {
    entries: SourceProvenanceEntry[];
    warnings: string[];
    results: ProvenanceOperationResult[];
}
export declare function collectSourceProvenanceEntries(projectRoot: string, options?: CollectProvenanceOptions): Promise<{
    entries: SourceProvenanceEntry[];
    warnings: string[];
}>;
export declare function verifySourceProvenance(projectRoot: string, options?: CollectProvenanceOptions): Promise<ProvenanceRunResult>;
export declare function generateBuildInfoFromSourceProvenance(projectRoot: string, options?: ProvenanceOperationOptions): Promise<ProvenanceRunResult>;
//# sourceMappingURL=provenance.d.ts.map