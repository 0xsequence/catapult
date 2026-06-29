import { CompilerInfo } from './artifacts';
import { SourceProvenance } from './source';
export interface Contract {
    uniqueHash: string;
    creationCode: string;
    runtimeBytecode?: string;
    abi?: any[];
    sourceName?: string;
    contractName?: string;
    source?: string;
    compiler?: CompilerInfo;
    buildInfoId?: string;
    sourceProvenance?: SourceProvenance;
    _sources: Set<string>;
    _sourceProvenance?: Map<string, SourceProvenance>;
}
//# sourceMappingURL=contracts.d.ts.map