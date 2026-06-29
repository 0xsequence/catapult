import { BuildInfoSourceProvenance, SourceDocument, SourceProvenance, SourceProvenanceOverride } from '../types';
export declare function parseSourceDocument(yamlContent: string): SourceDocument | null;
export declare function mergeSourceProvenance(base: BuildInfoSourceProvenance, override?: SourceProvenanceOverride): SourceProvenance;
//# sourceMappingURL=source.d.ts.map