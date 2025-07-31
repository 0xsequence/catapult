import { Network } from '../types/network'
import { BuildInfo } from '../types/buildinfo'
import { Contract } from '../types/contracts'

export interface VerificationRequest {
  contract: Contract  // Contract object 
  buildInfo: BuildInfo
  address: string
  constructorArguments?: string  // Hex encoded constructor args
  apiKey: string
  network: Network
  maxRetries?: number  // Number of retries for "contract not found" errors
  retryDelayMs?: number  // Delay between retries in milliseconds
}

export interface VerificationResult {
  success: boolean
  guid?: string
  message: string
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
async function submitVerificationAttempt(request: VerificationRequest): Promise<VerificationResult> {
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
    apikey: request.apiKey,
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
export async function submitVerification(request: VerificationRequest): Promise<VerificationResult> {
  const maxRetries = request.maxRetries ?? 3
  const retryDelayMs = request.retryDelayMs ?? 5000 // 5 seconds default
  
  let lastError: string = ''
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await submitVerificationAttempt(request)
      
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
      
      // Wait before retrying
      console.log(`Verification attempt ${attempt + 1} failed with "contract not found" error. Retrying in ${retryDelayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // If it's a "contract not found" type error and we have retries left, continue
      if (isContractNotFoundError(errorMessage) && attempt < maxRetries) {
        lastError = errorMessage
        console.log(`Verification attempt ${attempt + 1} failed with "contract not found" error. Retrying in ${retryDelayMs}ms...`)
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