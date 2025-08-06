import { ethers } from 'ethers'
import { Network } from './types'

/**
 * Attempts to detect network information from an RPC URL
 * @param rpcUrl The RPC URL to query
 * @returns Promise that resolves with detected network information
 */
export async function detectNetworkFromRpc(rpcUrl: string): Promise<Partial<Network>> {
  // Detect network information from RPC URL
  
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    
    // Create provider and get network information
    const network = await provider.getNetwork()
    
    // Network detected successfully
    
    return {
      name: network.name,
      chainId: Number(network.chainId),
      rpcUrl: rpcUrl
    }
  } catch (error) {
    // Failed to detect network
    throw new Error(`Failed to detect network from RPC URL "${rpcUrl}": ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Validates if a string is a valid RPC URL
 * @param url The URL to validate
 * @returns True if the URL appears to be a valid RPC URL
 */
export function isValidRpcUrl(url: string): boolean {
  try {
    // Basic URL validation
    const urlObj = new URL(url)
    
    // Check if it's http/https or a common RPC protocol
    const isValidProtocol = urlObj.protocol === 'http:' || 
                           urlObj.protocol === 'https:' ||
                           url.startsWith('ws://') || 
                           url.startsWith('wss://')
    
    if (!isValidProtocol) {
      // Invalid protocol
      return false
    }
    
    // Check if it has a hostname
    if (!urlObj.hostname) {
      // Missing hostname
      return false
    }
    
    // Valid RPC URL format
    return true
  } catch (error) {
    // Invalid RPC URL format
    return false
  }
}