export interface SourceProvenance {
    repo: string;
    ref?: string;
    commit?: string;
    build?: string;
    sourceDocumentPath?: string;
    buildInfoPath?: string;
}
export interface SourceProvenanceOverride {
    repo?: string;
    ref?: string;
    commit?: string;
    build?: string;
}
export interface BuildInfoSourceProvenance extends SourceProvenance {
    contracts?: Record<string, SourceProvenanceOverride>;
}
export interface SourceDocument {
    type: 'source';
    build_info: Record<string, BuildInfoSourceProvenance>;
    warnings?: string[];
    _path?: string;
}
//# sourceMappingURL=source.d.ts.map