import { ArtifactParser } from './types'
import { naiveParser } from './naive'
import { Artifact } from '../../types'

// Array of all available artifact parsers.
// To add a new format, create a new parser and add it to this list.
const parsers: ArtifactParser[] = [
  naiveParser,
  // Future parsers (e.g., foundryParser, truffleParser) would go here.
]

/**
 * Attempts to parse a file's content using a series of registered parsers.
 * Returns the first successfully parsed Artifact.
 * @param content The raw string content of the file.
 * @param filePath The path to the file being parsed.
 * @returns A parsed Artifact object or null if no parser succeeds.
 */
export function parseArtifact(content: string, filePath: string): Omit<Artifact, '_path' | '_hash'> | null {
  for (const parser of parsers) {
    const result = parser(content, filePath)
    if (result) {
      return result
    }
  }
  return null
}