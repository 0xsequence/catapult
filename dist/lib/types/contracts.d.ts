import { CompilerInfo } from './artifacts';
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
    _sources: Set<string>;
}
//# sourceMappingURL=contracts.d.ts.map