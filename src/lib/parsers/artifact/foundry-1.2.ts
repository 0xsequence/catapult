import { ArtifactParser } from './types'
import { Artifact } from '../../types'
import * as path from 'path'

/**
 * A parser for Foundry 1.2+ artifact format.
 * Can handle artifacts with or without explicit "contractName" field.
 * If no contractName is present, it attempts to extract it from:
 * 1. metadata.settings.compilationTarget
 * 2. The filename as a fallback
 */
export const foundry12Parser: ArtifactParser = (content: string, filePath: string): Omit<Artifact, '_path' | '_hash'> | null => {
  try {
    const json = JSON.parse(content)

    // Basic validation to see if it matches our expected structure
    if (
      typeof json === 'object' &&
      json !== null &&
      Array.isArray(json.abi) &&
      (typeof json.bytecode === 'string' || (typeof json.bytecode === 'object' && typeof json.bytecode.object === 'string'))
    ) {
      // Handle Hardhat-style bytecode object vs. simple string
      const bytecode = typeof json.bytecode === 'object' ? json.bytecode.object : json.bytecode
      if (!bytecode || !bytecode.startsWith('0x')) {
        return null // Bytecode must be a hex string
      }
      
      const deployedBytecode = typeof json.deployedBytecode === 'object' ? json.deployedBytecode?.object : json.deployedBytecode

      // Extract contract name from various sources
      let contractName = json.contractName

      // If no explicit contractName, prefer filename over metadata to match file-based lookups
      if (!contractName && filePath) {
        const basename = path.basename(filePath, '.json')
        contractName = basename
      }

      // If still no contract name, try to extract from metadata as fallback
      if (!contractName && json.metadata?.settings?.compilationTarget) {
        const compilationTarget = json.metadata.settings.compilationTarget
        // compilationTarget is like {"src/Counter.sol": "Counter"}
        const contractNames = Object.values(compilationTarget)
        if (contractNames.length > 0) {
          contractName = contractNames[0]
        }
      }

      // Must have a contract name to proceed
      if (!contractName) {
        return null
      }

      // We have a likely match
      return {
        contractName: contractName,
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