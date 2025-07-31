import { Network } from '../types/network'
import { BuildInfo } from '../types/buildinfo'
import { Contract } from '../types/contracts'
import { DeploymentEventEmitter } from '../events/emitter'

// Generic verification platform interface
export interface VerificationPlatform {
  /**
   * The name of this verification platform (e.g., 'etherscan_v2', 'sourcify')
   */
  readonly name: string

  /**
   * Check if this platform supports verification on the given network
   */
  supportsNetwork(network: Network): boolean

  /**
   * Check if the required configuration (API keys, etc.) is available
   */
  isConfigured(): boolean

  /**
   * Get a description of what configuration is missing (for error messages)
   */
  getConfigurationRequirements(): string

  /**
   * Check if a contract is already verified on this platform
   */
  isContractAlreadyVerified(address: string, network: Network): Promise<boolean>

  /**
   * Submit a contract for verification
   */
  verifyContract(request: VerificationRequest): Promise<VerificationResult>
}

export interface VerificationRequest {
  contract: Contract  // Contract object 
  buildInfo: BuildInfo
  address: string
  constructorArguments?: string  // Hex encoded constructor args
  network: Network
  maxRetries?: number  // Number of retries for "contract not found" errors
  retryDelayMs?: number  // Delay between retries in milliseconds
}

export interface VerificationResult {
  success: boolean
  guid?: string
  message: string
  isAlreadyVerified?: boolean  // Indicates if verification was skipped because already verified
}

export interface VerificationStatus {
  isComplete: boolean
  isSuccess: boolean
  message: string
}

/**
 * Checks if an error message indicates that the contract code was not found
 */
function isContractNotFoundError(message: string): boolean {
  return message.toLowerCase().includes('unable to locate contractcode') ||
         message.toLowerCase().includes('contract source code not verified') ||
         message.toLowerCase().includes('contract not found')
}

/**
 * Checks if an error message indicates that the contract is already verified
 */
function isAlreadyVerifiedError(message: string): boolean {
  return message.toLowerCase().includes('already verified') ||
         message.toLowerCase().includes('contract source code already verified')
}

/**
 * Extracts the full compiler version with commit hash from contract metadata
 */
function getFullCompilerVersion(buildInfo: BuildInfo): string {
  // Try to extract from any contract's metadata
  for (const [sourceName, contracts] of Object.entries(buildInfo.output.contracts)) {
    for (const [contractName, contract] of Object.entries(contracts)) {
      if (contract.metadata) {
        try {
          const metadata = JSON.parse(contract.metadata)
          if (metadata.compiler?.version) {
            return metadata.compiler.version
          }
        } catch (error) {
          // Continue to next contract if metadata parsing fails
          continue
        }
      }
    }
  }
  
  // Fallback to the basic version if metadata extraction fails
  return buildInfo.solcLongVersion
}

/**
 * Gets the Etherscan v2 API URL (unified endpoint for all chains)
 */
function getEtherscanApiUrl(chainId: number): string {
  return `https://api.etherscan.io/v2/api?chainid=${chainId}`
}

/**
 * Checks if a contract is already verified on Etherscan using the v2 API
 */
export async function isContractAlreadyVerified(
  address: string,
  apiKey: string,
  network: Network
): Promise<boolean> {
  const apiUrl = getEtherscanApiUrl(network.chainId)
  
  const params = new URLSearchParams({
    module: 'contract',
    action: 'getsourcecode',
    address: address,
    apikey: apiKey
  })

  try {
    const response = await fetch(`${apiUrl}&${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15000), // 15 second timeout
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json() as { status: string; result: any }

    // If status is "1" and result contains source code, the contract is verified
    if (data.status === '1' && Array.isArray(data.result) && data.result.length > 0) {
      const sourceCode = data.result[0]?.SourceCode
      return !!(sourceCode && sourceCode.length > 0)
    }

    return false
  } catch (error) {
    // If we can't determine the verification status, assume it's not verified
    // and let the verification attempt proceed (which will handle any errors)
    console.warn(`Failed to check verification status for ${address}: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * Internal function to perform a single verification attempt
 */
async function submitVerificationAttempt(request: VerificationRequest, apiKey: string): Promise<VerificationResult> {
  const apiUrl = getEtherscanApiUrl(request.network.chainId)
  
  // Extract the fully qualified contract name from the contract object
  const contractName = `${request.contract.sourceName}:${request.contract.contractName}`
  
  // Clean the input to only include standard Solidity compiler input format keys
  const cleanedInput = {
    language: request.buildInfo.input.language,
    sources: request.buildInfo.input.sources,
    settings: {
      // Only include standard settings that Etherscan supports
      ...(request.buildInfo.input.settings.optimizer && { optimizer: request.buildInfo.input.settings.optimizer }),
      ...(request.buildInfo.input.settings.evmVersion && { evmVersion: request.buildInfo.input.settings.evmVersion }),
      ...(request.buildInfo.input.settings.remappings && { remappings: request.buildInfo.input.settings.remappings }),
      ...(request.buildInfo.input.settings.viaIR && { viaIR: request.buildInfo.input.settings.viaIR }),
      ...(request.buildInfo.input.settings.libraries && { libraries: request.buildInfo.input.settings.libraries }),
      outputSelection: request.buildInfo.input.settings.outputSelection,
      ...(request.buildInfo.input.settings.metadata && { metadata: request.buildInfo.input.settings.metadata })
    }
  }
  
  const sourceCode = JSON.stringify(cleanedInput)
  
  // Extract the full compiler version with commit hash from contract metadata
  const fullCompilerVersion = getFullCompilerVersion(request.buildInfo)
  
  const formData = new URLSearchParams({
    module: 'contract',
    action: 'verifysourcecode',
    codeformat: 'solidity-standard-json-input',
    sourceCode,
    contractaddress: request.address,
    contractname: contractName,
    compilerversion: `v${fullCompilerVersion}`,
    apikey: apiKey,
  })
  
  if (request.constructorArguments) {
    // Remove 0x prefix if present
    const constructorArgs = request.constructorArguments.startsWith('0x') 
      ? request.constructorArguments.slice(2) 
      : request.constructorArguments
    formData.append('constructorArguements', constructorArgs) // Note: Etherscan API has this typo
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString(),
    signal: AbortSignal.timeout(30000), // 30 second timeout
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json() as { status: string; result: string }

  if (data.status === '1') {
    return {
      success: true,
      guid: data.result,
      message: 'Verification submitted successfully'
    }
  } else {
    const errorMessage = data.result || 'Unknown error occurred'
    
    // Treat "Already Verified" as a success case
    if (isAlreadyVerifiedError(errorMessage)) {
      return {
        success: true,
        message: 'Contract is already verified'
      }
    }
    
    return {
      success: false,
      message: errorMessage
    }
  }
}

/**
 * Submits a contract for verification to Etherscan using the v2 API with retry logic
 */
export async function submitVerification(
  request: VerificationRequest, 
  apiKey: string, 
  eventEmitter?: DeploymentEventEmitter
): Promise<VerificationResult> {
  const maxRetries = request.maxRetries ?? 3
  const retryDelayMs = request.retryDelayMs ?? 5000 // 5 seconds default
  
  let lastError: string = ''
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await submitVerificationAttempt(request, apiKey)
      
      // If successful or if it's not a "contract not found" error, return immediately
      if (result.success || !isContractNotFoundError(result.message)) {
        return result
      }
      
      // Store the error message for potential retry
      lastError = result.message
      
      // If this is the last attempt, don't wait
      if (attempt === maxRetries) {
        break
      }
      
      // Emit retry event if emitter is available
      if (eventEmitter) {
        eventEmitter.emitEvent({
          type: 'verification_retry',
          level: 'info',
          data: {
            platform: 'etherscan_v2',
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            error: lastError
          }
        })
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // If it's a "contract not found" type error and we have retries left, continue
      if (isContractNotFoundError(errorMessage) && attempt < maxRetries) {
        lastError = errorMessage
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
        continue
      }
      
      // For other errors or if we're out of retries, return the error
      return {
        success: false,
        message: `API request failed: ${errorMessage}`
      }
    }
  }
  
  // All retries exhausted
  return {
    success: false,
    message: `Verification failed after ${maxRetries + 1} attempts. Last error: ${lastError}`
  }
}

/**
 * Checks the verification status of a submitted contract
 */
export async function checkVerificationStatus(
  guid: string, 
  apiKey: string, 
  network: Network
): Promise<VerificationStatus> {
  const apiUrl = getEtherscanApiUrl(network.chainId)
  
  const params = new URLSearchParams({
    module: 'contract',
    action: 'checkverifystatus',
    guid,
    apikey: apiKey
  })

  try {
    const response = await fetch(`${apiUrl}&${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15000), // 15 second timeout
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json() as { status: string; result: string }

    if (data.status === '1') {
      return {
        isComplete: true,
        isSuccess: true,
        message: 'Verification successful'
      }
    } else if (data.status === '0') {
      const result = data.result || ''
      if (result.includes('Pending')) {
        return {
          isComplete: false,
          isSuccess: false,
          message: 'Verification pending'
        }
      } else if (isAlreadyVerifiedError(result)) {
        // Treat "Already Verified" as success during status check
        return {
          isComplete: true,
          isSuccess: true,
          message: 'Contract is already verified'
        }
      } else {
        return {
          isComplete: true,
          isSuccess: false,
          message: result || 'Verification failed'
        }
      }
    } else {
      return {
        isComplete: true,
        isSuccess: false,
        message: data.result || 'Unknown verification status'
      }
    }
  } catch (error) {
    throw new Error(`Failed to check verification status: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Polls verification status until completion or timeout
 */
export async function waitForVerification(
  guid: string, 
  apiKey: string, 
  network: Network,
  timeoutMs: number = 300000 // 5 minute default timeout
): Promise<VerificationStatus> {
  const startTime = Date.now()
  const pollInterval = 5000 // Poll every 5 seconds
  
  while (Date.now() - startTime < timeoutMs) {
    const status = await checkVerificationStatus(guid, apiKey, network)
    
    if (status.isComplete) {
      return status
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }
  
  throw new Error(`Verification timed out after ${timeoutMs / 1000} seconds`)
}

/**
 * Etherscan verification platform implementation
 */
export class EtherscanVerificationPlatform implements VerificationPlatform {
  readonly name = 'etherscan_v2'
  private apiKey?: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey
  }

  supportsNetwork(network: Network): boolean {
    return !network.supports || network.supports.includes(this.name)
  }

  isConfigured(): boolean {
    return !!this.apiKey
  }

  getConfigurationRequirements(): string {
    return 'Etherscan API key is required. Set --etherscan-api-key or ETHERSCAN_API_KEY environment variable.'
  }

  async isContractAlreadyVerified(address: string, network: Network): Promise<boolean> {
    if (!this.apiKey) {
      throw new Error('Etherscan API key not configured')
    }
    return isContractAlreadyVerified(address, this.apiKey, network)
  }

  async verifyContract(request: VerificationRequest): Promise<VerificationResult> {
    if (!this.apiKey) {
      throw new Error('Etherscan API key not configured')
    }

    // Check if already verified first
    const alreadyVerified = await this.isContractAlreadyVerified(request.address, request.network)
    if (alreadyVerified) {
      return {
        success: true,
        message: 'Contract was already verified (checked before attempting verification)',
        isAlreadyVerified: true
      }
    }

    // Submit verification with API key
    const verificationResult = await submitVerification(request, this.apiKey)

    if (!verificationResult.success) {
      return verificationResult
    }

    // If we have a guid, wait for verification to complete
    if (verificationResult.guid) {
      const verificationStatus = await waitForVerification(verificationResult.guid, this.apiKey, request.network)
      
      if (!verificationStatus.isSuccess) {
        return {
          success: false,
          message: `Verification failed: ${verificationStatus.message}`
        }
      }
      
      return {
        success: true,
        guid: verificationResult.guid,
        message: 'Contract verified successfully'
      }
    } else {
      // Contract was already verified during submission
      return {
        success: true,
        message: 'Contract was already verified',
        isAlreadyVerified: true
      }
    }
  }
}

/**
 * Registry for verification platforms
 */
export class VerificationPlatformRegistry {
  private platforms = new Map<string, VerificationPlatform>()

  /**
   * Register a verification platform
   */
  register(platform: VerificationPlatform): void {
    this.platforms.set(platform.name, platform)
  }

  /**
   * Get a verification platform by name
   */
  get(platformName: string): VerificationPlatform | undefined {
    return this.platforms.get(platformName)
  }

  /**
   * Get all available platforms
   */
  getAll(): VerificationPlatform[] {
    return Array.from(this.platforms.values())
  }

  /**
   * Get all platforms that support the given network
   */
  getSupportedPlatforms(network: Network): VerificationPlatform[] {
    return this.getAll().filter(platform => platform.supportsNetwork(network))
  }

  /**
   * Get all configured platforms that support the given network
   */
  getConfiguredPlatforms(network: Network): VerificationPlatform[] {
    return this.getSupportedPlatforms(network).filter(platform => platform.isConfigured())
  }
}

/**
 * Default verification platform registry instance
 */
export function createDefaultVerificationRegistry(etherscanApiKey?: string): VerificationPlatformRegistry {
  const registry = new VerificationPlatformRegistry()
  
  // Register Etherscan platform
  registry.register(new EtherscanVerificationPlatform(etherscanApiKey))
  
  // Register Sourcify platform
  const { SourcifyVerificationPlatform } = require('./sourcify')
  registry.register(new SourcifyVerificationPlatform())
  
  return registry
} 