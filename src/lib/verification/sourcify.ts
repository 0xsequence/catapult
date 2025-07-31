import { Network } from '../types/network'
import { VerificationPlatform, VerificationRequest, VerificationResult } from './etherscan'

export class SourcifyVerificationPlatform implements VerificationPlatform {
  readonly name = 'sourcify'

  supportsNetwork(network: Network): boolean {
    // Sourcify supports most networks, but we can add specific logic here if needed
    return !network.supports || network.supports.includes(this.name)
  }

  isConfigured(): boolean {
    // Sourcify requires no configuration
    return true
  }

  getConfigurationRequirements(): string {
    return 'Sourcify requires no configuration'
  }

  async isContractAlreadyVerified(address: string, network: Network): Promise<boolean> {
    try {
      const response = await fetch(
        `https://sourcify.dev/server/check-by-addresses?addresses=${address}&chainIds=${network.chainId}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(15000), // 15 second timeout
        }
      )

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      
      // Check if the contract is verified (perfect or partial match)
      return Array.isArray(data) && data.some(item => 
        item.address?.toLowerCase() === address.toLowerCase() &&
        item.chainId === network.chainId.toString() &&
        (item.status === 'perfect' || item.status === 'partial')
      )
    } catch (error) {
      // If we can't determine the verification status, assume it's not verified
      console.warn(`Failed to check Sourcify verification status for ${address}: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  async verifyContract(request: VerificationRequest): Promise<VerificationResult> {
    const { contract, buildInfo, address, network } = request

    // First check if it's already verified
    const alreadyVerified = await this.isContractAlreadyVerified(address, network)
    if (alreadyVerified) {
      return {
        success: true,
        message: 'Contract was already verified on Sourcify (checked before attempting verification)',
        isAlreadyVerified: true
      }
    }

    try {
      // Extract metadata and source files
      const { metadata, sourceFiles } = await this.createVerificationData(contract, buildInfo)

      // Use web standard FormData instead of node form-data package
      const formData = new FormData()

      formData.append('address', address)
      formData.append('chain', network.chainId.toString())
      
      // Upload files individually to Sourcify
      // First add the metadata.json
      const metadataJson = JSON.stringify(metadata, null, 2)
      const metadataBlob = new Blob([metadataJson], { type: 'application/json' })
      formData.append('files', metadataBlob, 'metadata.json')
      
      // Add each source file individually
      for (const [sourcePath, sourceContent] of sourceFiles) {
        const sourceBlob = new Blob([sourceContent], { type: 'text/plain' })
        formData.append('files', sourceBlob, sourcePath)
      }

      const response = await fetch('https://sourcify.dev/server/verify', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000), // 60 second timeout for verification
      })

      if (!response.ok) {
        let errorDetails = `HTTP ${response.status}: ${response.statusText}`
        try {
          const responseText = await response.text()
          if (responseText) {
            errorDetails += ` - ${responseText}`
          }
        } catch (err) {
          // Ignore error reading response body
        }
        return {
          success: false,
          message: `Sourcify API request failed: ${errorDetails}`
        }
      }

      const result = await response.json() as any
      
      // Check for different response formats
      if (result.result && Array.isArray(result.result)) {
        // Array response format - check if any items have perfect/partial status
        const perfectMatch = result.result.find((item: any) => item.status === 'perfect')
        const partialMatch = result.result.find((item: any) => item.status === 'partial')
        
        if (perfectMatch || partialMatch) {
          const matchType = perfectMatch ? 'perfect' : 'partial'
          return {
            success: true,
            message: `Contract verified successfully on Sourcify (${matchType} match)`
          }
        }
        
        return {
          success: false,
          message: 'Sourcify verification failed - no perfect or partial match found'
        }
      } else if (result.status) {
        // Single object response format
        if (result.status === 'perfect' || result.status === 'partial') {
          return {
            success: true,
            message: `Contract verified successfully on Sourcify (status: ${result.status})`
          }
        } else if (result.status === 'error') {
          return {
            success: false,
            message: result.message || 'Sourcify verification failed with unknown error'
          }
        } else {
          return {
            success: false,
            message: `Sourcify verification failed with status: ${result.status}`
          }
        }
      } else {
        // Unknown response format
        return {
          success: false,
          message: `Sourcify verification failed - unexpected response format: ${JSON.stringify(result)}`
        }
      }
    } catch (error) {
      return {
        success: false,
        message: `Sourcify verification failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  private async createVerificationData(contract: any, buildInfo: any): Promise<{
    metadata: any,
    sourceFiles: Array<[string, string]>
  }> {
    // Extract source files from the build info
    const sourceFiles: Array<[string, string]> = []
    for (const [sourcePath, sourceInfo] of Object.entries(buildInfo.input.sources) as [string, any][]) {
      if (sourceInfo.content) {
        sourceFiles.push([sourcePath, sourceInfo.content])
      }
    }

    // Try to find metadata from the contract's artifact if available
    let metadata = null
    
    // First, try to get metadata from the contract's artifact file  
    try {
      // Look for artifact file in contract sources (convert Set to Array)
      const sources = Array.from(contract._sources) as string[]
      const artifactPath = sources.find((source) => 
        source.includes('/artifacts/') && source.endsWith('.json') && !source.includes('/build-info/')
      )
      
      if (artifactPath) {
        const fs = await import('fs/promises')
        const artifactContent = await fs.readFile(artifactPath, 'utf-8')
        const artifact = JSON.parse(artifactContent)
        
        // Use rawMetadata if available (it's a JSON string)
        if (artifact.rawMetadata) {
          metadata = JSON.parse(artifact.rawMetadata)
        } else if (artifact.metadata) {
          metadata = artifact.metadata
        }
      }
    } catch (error) {
      console.warn(`Failed to load artifact metadata: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Fallback: look for metadata in the build info output
    if (!metadata && buildInfo.output?.contracts?.[contract.sourceName]?.[contract.contractName]?.metadata) {
      const metadataField = buildInfo.output.contracts[contract.sourceName][contract.contractName].metadata
      metadata = typeof metadataField === 'string' ? JSON.parse(metadataField) : metadataField
    }

    // Last resort fallback: create basic metadata from the input
    if (!metadata) {
      metadata = {
        compiler: {
          version: buildInfo.solcLongVersion || buildInfo.solcVersion
        },
        language: buildInfo.input.language,
        output: {
          abi: buildInfo.output?.contracts?.[contract.sourceName]?.[contract.contractName]?.abi || [],
          devdoc: { kind: 'dev', methods: {}, version: 1 },
          userdoc: { kind: 'user', methods: {}, version: 1 }
        },
        settings: buildInfo.input.settings,
        sources: buildInfo.input.sources,
        version: 1
      }
    }

    // Validation: ensure metadata has compilation target
    if (!metadata?.settings?.compilationTarget) {
      console.warn('Warning: Metadata missing compilation target')
    }

    return { metadata, sourceFiles }
  }

  // Legacy method - keeping for now but not used
  private async createSourceZip(contract: any, buildInfo: any): Promise<Buffer> {
    const { metadata, sourceFiles } = await this.createVerificationData(contract, buildInfo)
    
    const JSZip = await import('jszip')
    const zip = new JSZip.default()

    // Add source files to zip
    for (const [sourcePath, sourceContent] of sourceFiles) {
      zip.file(sourcePath, sourceContent)
    }

    // Add metadata.json
    zip.file('metadata.json', JSON.stringify(metadata, null, 2))

    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    })
  }
}