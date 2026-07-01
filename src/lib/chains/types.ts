import { ethers } from 'ethers'
import { Network } from '../types/network'

export type ChainPlatform = 'evm' | 'tron' | 'svm'

export type ChainNativeValue = string | number | bigint

export interface ChainTransactionRequest {
  to: string
  data?: string
  value?: ChainNativeValue
  gasLimit?: ethers.BigNumberish
}

export interface ChainContractCreationRequest {
  data: string
  value?: ChainNativeValue
  gasLimit?: ethers.BigNumberish
  abi?: unknown[]
}

export interface ChainCallRequest {
  to: string
  data: string
}

export interface ChainTransactionReceipt {
  status: number | null
  blockNumber?: number
  contractAddress?: string | null
  raw?: unknown
}

export interface ChainTransactionResponse {
  hash: string
  raw?: unknown
  wait(): Promise<ChainTransactionReceipt | null>
}

export interface ChainCostEstimate {
  gasLimit?: bigint
  gasPrice?: bigint
  requiredBalance: bigint
  signerBalance: bigint
  nativeUnit: string
  formattedRequired: string
  formattedBalance: string
}

export interface ChainAdapter {
  readonly platform: ChainPlatform
  readonly nativeCurrencySymbol: string
  readonly supportsNickMethod: boolean
  readonly supportsRawSignedTransactions: boolean
  readonly supportsEvmSignatures: boolean

  getNetwork(): Network
  getSignerAddress(): Promise<string>
  getSignerBalance(): Promise<bigint>
  formatNativeValue(value: bigint): string
  isAddress(value: unknown): value is string
  normalizeAddress(value: string): string
  formatAddress(value: string): string

  getBalance(address: string): Promise<bigint>
  getCode(address: string): Promise<string>
  getStorageAt(address: string, slot: bigint): Promise<string>
  call(request: ChainCallRequest): Promise<string>

  estimateGas(request: ChainTransactionRequest | ChainContractCreationRequest): Promise<bigint>
  estimateTransactionCost(request: ChainTransactionRequest | ChainContractCreationRequest): Promise<ChainCostEstimate | null>
  sendTransaction(request: ChainTransactionRequest): Promise<ChainTransactionResponse>
  createContract(request: ChainContractCreationRequest): Promise<ChainTransactionResponse>
  broadcastSignedTransaction(rawTransaction: string): Promise<ChainTransactionResponse>

  dispose(): Promise<void>
}
