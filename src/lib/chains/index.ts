import { Network } from '../types/network'
import { EvmAdapter } from './evm'
import { TronAdapter } from './tron'
import { SvmAdapter } from './svm'
import { ChainAdapter, ChainPlatform } from './types'

export function getNetworkPlatform(network: Network): ChainPlatform {
  return network.platform || 'evm'
}

export function createChainAdapter(network: Network, privateKey?: string, keypairPath?: string): ChainAdapter {
  const platform = getNetworkPlatform(network)
  switch (platform) {
    case 'evm':
      return new EvmAdapter(network, privateKey)
    case 'tron':
      return new TronAdapter(network, privateKey)
    case 'svm':
      return new SvmAdapter(network, keypairPath)
    default: {
      const exhaustive: never = platform
      throw new Error(`Unsupported network platform: ${exhaustive}`)
    }
  }
}

export * from './types'
export { EvmAdapter } from './evm'
export { TronAdapter } from './tron'
export { SvmAdapter } from './svm'
