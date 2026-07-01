import { Network } from '../types/network'
import { EvmAdapter } from './evm'
import { TronAdapter } from './tron'
import { ChainAdapter, ChainPlatform } from './types'

class UnsupportedPlatformAdapter implements ChainAdapter {
  public readonly nativeCurrencySymbol = 'UNKNOWN'
  public readonly supportsNickMethod = false
  public readonly supportsRawSignedTransactions = false
  public readonly supportsEvmSignatures = false

  constructor(
    public readonly platform: ChainPlatform,
    private readonly network: Network
  ) {}

  public getNetwork(): Network {
    return this.network
  }

  public async getSignerAddress(): Promise<string> {
    throw this.unsupported()
  }

  public async getSignerBalance(): Promise<bigint> {
    throw this.unsupported()
  }

  public formatNativeValue(value: bigint): string {
    return value.toString()
  }

  public isAddress(_value: unknown): _value is string {
    return false
  }

  public normalizeAddress(_value: string): string {
    throw this.unsupported()
  }

  public formatAddress(_value: string): string {
    throw this.unsupported()
  }

  public async getBalance(_address: string): Promise<bigint> {
    throw this.unsupported()
  }

  public async getCode(_address: string): Promise<string> {
    throw this.unsupported()
  }

  public async getStorageAt(_address: string, _slot: bigint): Promise<string> {
    throw this.unsupported()
  }

  public async call(): Promise<string> {
    throw this.unsupported()
  }

  public async estimateGas(): Promise<bigint> {
    throw this.unsupported()
  }

  public async estimateTransactionCost(): Promise<null> {
    throw this.unsupported()
  }

  public async sendTransaction(): Promise<never> {
    throw this.unsupported()
  }

  public async createContract(): Promise<never> {
    throw this.unsupported()
  }

  public async broadcastSignedTransaction(): Promise<never> {
    throw this.unsupported()
  }

  public async dispose(): Promise<void> {}

  private unsupported(): Error {
    return new Error(`Platform "${this.platform}" is recognized but not implemented yet.`)
  }
}

export function getNetworkPlatform(network: Network): ChainPlatform {
  return network.platform || 'evm'
}

export function createChainAdapter(network: Network, privateKey?: string): ChainAdapter {
  const platform = getNetworkPlatform(network)
  switch (platform) {
    case 'evm':
      return new EvmAdapter(network, privateKey)
    case 'tron':
      return new TronAdapter(network, privateKey)
    case 'svm':
      return new UnsupportedPlatformAdapter(platform, network)
    default: {
      const exhaustive: never = platform
      throw new Error(`Unsupported network platform: ${exhaustive}`)
    }
  }
}

export * from './types'
export { EvmAdapter } from './evm'
export { TronAdapter } from './tron'
