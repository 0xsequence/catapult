import { Network } from '../types/network'
import { BuildInfo } from '../types/buildinfo'

export interface VerificationRequest {
  address: string
  buildInfo: BuildInfo
  contractName: string  // Fully qualified name like "contracts/MyToken.sol:MyToken"
  constructorArguments?: string  // Hex encoded constructor args
  apiKey: string
  network: Network
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
 * Gets the Etherscan API URL for a given network
 */
function getEtherscanApiUrl(network: Network): string {
  const chainId = network.chainId
  
  switch (chainId) {
    case 1: // Ethereum Mainnet
      return 'https://api.etherscan.io/api'
    case 11155111: // Sepolia
      return 'https://api-sepolia.etherscan.io/api'
    case 137: // Polygon
      return 'https://api.polygonscan.com/api'
    case 56: // BSC
      return 'https://api.bscscan.com/api'
    case 42161: // Arbitrum One
      return 'https://api.arbiscan.io/api'
    case 10: // Optimism
      return 'https://api-optimistic.etherscan.io/api'
    case 8453: // Base
      return 'https://api.basescan.org/api'
    case 43114: // Avalanche
      return 'https://api.snowtrace.io/api'
    default:
      throw new Error(`Etherscan verification not supported for chain ID ${chainId}`)
  }
}

/**
 * Submits a contract for verification to Etherscan using the v2 API
 */
export async function submitVerification(request: VerificationRequest): Promise<VerificationResult> {
  const apiUrl = getEtherscanApiUrl(request.network)
  
  const sourceCode = JSON.stringify(request.buildInfo.input)
  
  const formData = new URLSearchParams({
    module: 'contract',
    action: 'verifysourcecode',
    codeformat: 'solidity-standard-json-input',
    sourceCode,
    contractaddress: request.address,
    contractname: request.contractName,
    compilerversion: request.buildInfo.solcVersion,
    apikey: request.apiKey,
  })
  
  if (request.constructorArguments) {
    // Remove 0x prefix if present
    const constructorArgs = request.constructorArguments.startsWith('0x') 
      ? request.constructorArguments.slice(2) 
      : request.constructorArguments
    formData.append('constructorArguements', constructorArgs) // Note: Etherscan API has this typo
  }

  try {
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
      return {
        success: false,
        message: data.result || 'Unknown error occurred'
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        message: `API request failed: ${error.message}`
      }
    }
    return {
      success: false,
      message: `Unexpected error: ${String(error)}`
    }
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
  const apiUrl = getEtherscanApiUrl(network)
  
  const params = new URLSearchParams({
    module: 'contract',
    action: 'checkverifystatus',
    guid,
    apikey: apiKey
  })

  try {
    const response = await fetch(`${apiUrl}?${params.toString()}`, {
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