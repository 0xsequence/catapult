import { Artifact } from '../../types'

/**
 * A function that attempts to parse a file's content into a standard Artifact object.
 * @param content The raw string content of the file.
 * @param filePath The path to the file being parsed.
 * @returns An object conforming to the Artifact interface (without internal properties), or null if parsing fails.
 */
export type ArtifactParser = (content: string, filePath: string) => Omit<Artifact, '_path' | '_hash'> | null