import { ethers } from 'ethers'
import { Network } from './types'

/**
 * Attempts to detect network information from an RPC URL
 * @param rpcUrl The RPC URL to query
 * @returns Promise that resolves with detected network information
 */
export async function detectNetworkFromRpc(rpcUrl: string): Promise<Partial<Network>> {
  console.log(`[DEBUG] Attempting to detect network from RPC URL: ${rpcUrl}`)
  
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    
    console.log(`[DEBUG] Created provider, attempting to get network...`)
    const network = await provider.getNetwork()
    
    console.log(`[DEBUG] Detected network:`, {
      name: network.name,
      chainId: Number(network.chainId),
      rpcUrl: rpcUrl
    })
    
    return {
      name: network.name,
      chainId: Number(network.chainId),
      rpcUrl: rpcUrl
    }
  } catch (error) {
    console.log(`[DEBUG] Failed to detect network from RPC URL:`, error)
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
      console.log(`[DEBUG] Invalid RPC URL protocol: ${urlObj.protocol}`)
      return false
    }
    
    // Check if it has a hostname
    if (!urlObj.hostname) {
      console.log(`[DEBUG] RPC URL missing hostname`)
      return false
    }
    
    console.log(`[DEBUG] Valid RPC URL format: ${url}`)
    return true
  } catch (error) {
    console.log(`[DEBUG] Invalid RPC URL format: ${url}`, error)
    return false
  }
}