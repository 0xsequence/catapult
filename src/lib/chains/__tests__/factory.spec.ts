import { createChainAdapter, EvmAdapter, getNetworkPlatform, SvmAdapter, TronAdapter } from '..'
import { Network } from '../../types'

describe('chain adapter factory', () => {
  it('defaults networks without a platform to EVM', () => {
    const network: Network = {
      name: 'Local',
      chainId: 31337,
      rpcUrl: 'http://127.0.0.1:8545',
    }

    expect(getNetworkPlatform(network)).toBe('evm')
    expect(createChainAdapter(network, '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')).toBeInstanceOf(EvmAdapter)
  })

  it('creates a Tron adapter for Tron networks', () => {
    const network: Network = {
      name: 'Tron Nile',
      chainId: 3448148188,
      rpcUrl: 'https://nile.trongrid.io',
      platform: 'tron',
      params: {
        feeLimit: 100_000_000,
      },
    }

    expect(getNetworkPlatform(network)).toBe('tron')
    expect(createChainAdapter(network, '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')).toBeInstanceOf(TronAdapter)
  })

  it('creates an SVM adapter for Solana networks', () => {
    const network: Network = {
      name: 'Solana Localnet',
      chainId: 900_000,
      rpcUrl: 'http://127.0.0.1:8899',
      platform: 'svm',
    }

    const adapter = createChainAdapter(network)
    expect(adapter).toBeInstanceOf(SvmAdapter)
    expect(adapter.executionModel).toBe('svm')
  })
})
