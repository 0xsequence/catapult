import { ExtractedContract } from '../types';
export declare function parseBuildInfo(content: string, filePath: string): ExtractedContract[] | null;
export declare function isBuildInfoFile(filePath: string): boolean;
export declare function extractedContractToArtifact(extracted: ExtractedContract): Omit<import('../types').Artifact, '_path' | '_hash'>;
//# sourceMappingURL=buildinfo.d.ts.map