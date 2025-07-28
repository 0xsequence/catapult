import { ArtifactParser } from './types'
import { Artifact } from '../../types'

/**
 * A naive parser for a simple JSON artifact format.
 * Expects a JSON object with at least "contractName", "abi", and "bytecode".
 * It also handles the common Hardhat `bytecode: { object: "..." }` structure.
 */
export const naiveParser: ArtifactParser = (content: string): Omit<Artifact, '_path' | '_hash'> | null => {
  try {
    const json = JSON.parse(content)

    // Basic validation to see if it matches our expected structure
    if (
      typeof json === 'object' &&
      json !== null &&
      typeof json.contractName === 'string' &&
      Array.isArray(json.abi) &&
      (typeof json.bytecode === 'string' || (typeof json.bytecode === 'object' && typeof json.bytecode.object === 'string'))
    ) {
      // Handle Hardhat-style bytecode object vs. simple string
      const bytecode = typeof json.bytecode === 'object' ? json.bytecode.object : json.bytecode
      if (!bytecode || !bytecode.startsWith('0x')) {
        return null // Bytecode must be a hex string
      }
      
      const deployedBytecode = typeof json.deployedBytecode === 'object' ? json.deployedBytecode?.object : json.deployedBytecode

      // We have a likely match
      return {
        contractName: json.contractName,
        sourceName: json.sourceName,
        abi: json.abi,
        bytecode: bytecode,
        deployedBytecode: deployedBytecode,
        compiler: json.compiler,
        source: json.source,
      }
    }

    return null
  } catch (error) {
    // Not valid JSON, so it's not for this parser
    return null
  }
}