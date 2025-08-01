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
} 