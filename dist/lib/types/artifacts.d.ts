export interface CompilerInfo {
    version: string;
}
export interface Artifact {
    contractName: string;
    abi: any[];
    bytecode: string;
    deployedBytecode?: string;
    sourceName?: string;
    source?: string;
    compiler?: CompilerInfo;
    _path: string;
    _hash: string;
}
//# sourceMappingURL=artifacts.d.ts.map