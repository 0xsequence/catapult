import { Artifact } from '../../types';
export type ArtifactParser = (content: string, filePath: string) => Omit<Artifact, '_path' | '_hash'> | null;
//# sourceMappingURL=types.d.ts.map