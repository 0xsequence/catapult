/**
 * Represents a blockchain network configuration
 */
export interface Network {
  /** The human-readable name of the network */
  name: string
  
  /** Numeric network selector. For SVM this is a Catapult-local identifier. */
  chainId: number

  /**
   * Stable platform-native network identifier. SVM networks should use values
   * such as `solana-mainnet-beta` or a genesis hash; `chainId` remains required
   * for backwards-compatible Catapult selection and output grouping.
   */
  networkId?: string

  /** Optional expected Solana genesis hash, used to reject a mismatched RPC. */
  genesisHash?: string
  
  /** The RPC URL endpoint for the network */
  rpcUrl: string

  /**
   * Execution backend for this network. Defaults to "evm" for backward compatibility.
   * SVM selects the native Solana instruction/account execution model.
   */
  platform?: 'evm' | 'tron' | 'svm'

  /** Supported verification platforms */
  supports?: string[]

  /** Optional gas limit to use for all transactions on this network */
  gasLimit?: number
  
  /** Whether this is a test network */
  testnet?: boolean

  /**
   * The EVM hardfork version supported by this network, e.g. "istanbul", "berlin", "london",
   * "paris", "shanghai", "cancun". Used to filter jobs that require a minimum EVM version.
   */
  evmVersion?: string

  /**
   * Integrator-owned metadata bag. Keys are not validated by Catapult.
   */
  params?: Record<string, unknown>
}
