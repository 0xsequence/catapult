/**
 * Represents a blockchain network configuration
 */
export interface Network {
  /** The human-readable name of the network */
  name: string
  
  /** The chain ID of the network */
  chainId: number
  
  /** The RPC URL endpoint for the network */
  rpcUrl: string

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
   * Arbitrary per-network metadata for custom workflows.
   * Keys should be descriptive strings; values are JSON-serializable blobs.
   */
  custom?: Record<string, any>
}