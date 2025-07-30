import { createHash } from 'crypto'
import { keccak256, toUtf8Bytes } from 'ethers'
import { BuildInfo, ExtractedContract } from '../types'

/**
 * Validates if a parsed object is a valid build-info file
 */
function isValidBuildInfo(data: any): data is BuildInfo {
  return (
    data &&
    typeof data === 'object' &&
    (data._format === 'hh-sol-build-info-1' || data._format === 'ethers-rs-sol-build-info-1') &&
    typeof data.id === 'string' &&
    typeof data.solcVersion === 'string' &&
    typeof data.solcLongVersion === 'string' &&
    data.input &&
    typeof data.input === 'object' &&
    data.output &&
    typeof data.output === 'object' &&
    data.output.contracts &&
    typeof data.output.contracts === 'object'
  )
}

/**
 * Validates the build-info id by recomputing the hash
 */
function validateBuildInfoId(buildInfo: BuildInfo): boolean {
  try {
    // Recreate the stable JSON string as per spec (alphabetical key sort, no whitespace)
    const stableInput = JSON.stringify(buildInfo.input, Object.keys(buildInfo.input).sort())
    const inputString = buildInfo.solcVersion + stableInput
    const expectedId = keccak256(toUtf8Bytes(inputString)).slice(2) // Remove '0x' prefix
    
    return expectedId === buildInfo.id
  } catch (error) {
    // If we can't validate, we'll warn but continue
    return false
  }
}

/**
 * Parses a build-info file and extracts individual contracts
 * @param content The raw string content of the build-info file
 * @param filePath The path to the build-info file
 * @returns Array of extracted contracts or null if parsing fails
 */
export function parseBuildInfo(content: string, filePath: string): ExtractedContract[] | null {
  try {
    const data = JSON.parse(content)
    
    if (!isValidBuildInfo(data)) {
      return null
    }
    
    // Validate the build-info id (warn if invalid but continue parsing)
    if (!validateBuildInfoId(data)) {
      console.warn(`⚠️ build-info id mismatch in ${filePath}; file may be tampered`)
    }
    
    const extractedContracts: ExtractedContract[] = []
    
    // Extract contracts from output.contracts
    for (const [sourceName, sourceContracts] of Object.entries(data.output.contracts)) {
      for (const [contractName, contractData] of Object.entries(sourceContracts)) {
        // Validate contract data
        if (!contractData.abi || !Array.isArray(contractData.abi)) {
          continue
        }
        
        // Handle both Hardhat format (with 0x prefix) and ethers-rs format (without 0x prefix)
        if (!contractData.evm?.bytecode?.object || 
            (!contractData.evm.bytecode.object.startsWith('0x') && !/^[0-9a-fA-F]+$/.test(contractData.evm.bytecode.object))) {
          continue
        }
        
        // Get source content if available
        const sourceContent = data.input.sources[sourceName]?.content
        
        // Normalize bytecode to ensure it has 0x prefix (required by the rest of the system)
        const bytecode = contractData.evm.bytecode.object.startsWith('0x') 
          ? contractData.evm.bytecode.object 
          : '0x' + contractData.evm.bytecode.object
        
        const deployedBytecode = contractData.evm.deployedBytecode?.object
          ? (contractData.evm.deployedBytecode.object.startsWith('0x')
            ? contractData.evm.deployedBytecode.object
            : '0x' + contractData.evm.deployedBytecode.object)
          : undefined

        // Create the extracted contract
        const extractedContract: ExtractedContract = {
          contractName,
          sourceName,
          fullyQualifiedName: `${sourceName}:${contractName}`,
          abi: contractData.abi,
          bytecode,
          deployedBytecode,
          source: sourceContent,
          compiler: {
            version: data.solcLongVersion
          },
          buildInfoId: data.id,
          buildInfoPath: filePath
        }
        
        extractedContracts.push(extractedContract)
      }
    }
    
    return extractedContracts.length > 0 ? extractedContracts : null
    
  } catch (error) {
    // Not valid JSON or other parsing error
    return null
  }
}

/**
 * Checks if a file path looks like a build-info file
 * Follows the conventions: artifacts/build-info/*.json or out/build-info/*.json
 */
export function isBuildInfoFile(filePath: string): boolean {
  return filePath.includes('/build-info/') && filePath.endsWith('.json')
}

/**
 * Converts an ExtractedContract to an Artifact-compatible format
 */
export function extractedContractToArtifact(extracted: ExtractedContract): Omit<import('../types').Artifact, '_path' | '_hash'> {
  return {
    contractName: extracted.contractName,
    abi: extracted.abi,
    bytecode: extracted.bytecode,
    deployedBytecode: extracted.deployedBytecode,
    sourceName: extracted.sourceName,
    source: extracted.source,
    compiler: extracted.compiler
  }
} 