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

export interface BaseChainAdapter {
  readonly platform: ChainPlatform
  readonly executionModel: 'evm-like' | 'svm'
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

  dispose(): Promise<void>
}

/**
 * Transaction and contract operations shared by EVM and EVM-like runtimes such
 * as Tron. SVM deliberately does not implement this interface: a Solana
 * transaction is a list of instructions with explicit account metadata, not a
 * `to + data + value` envelope.
 */
export interface EvmLikeChainAdapter extends BaseChainAdapter {
  readonly executionModel: 'evm-like'

  getCode(address: string): Promise<string>
  getStorageAt(address: string, slot: bigint): Promise<string>
  call(request: ChainCallRequest): Promise<string>

  estimateGas(request: ChainTransactionRequest | ChainContractCreationRequest): Promise<bigint>
  estimateTransactionCost(request: ChainTransactionRequest | ChainContractCreationRequest): Promise<ChainCostEstimate | null>
  sendTransaction(request: ChainTransactionRequest): Promise<ChainTransactionResponse>
  createContract(request: ChainContractCreationRequest): Promise<ChainTransactionResponse>
  broadcastSignedTransaction(rawTransaction: string): Promise<ChainTransactionResponse>
}

export interface SvmAccountMetaRequest {
  address: string
  isSigner?: boolean
  isWritable?: boolean
}

export interface SvmInstructionRequest {
  programId: string
  accounts?: SvmAccountMetaRequest[]
  /** 0x-prefixed hex, base64 with a `base64:` prefix, or raw bytes. */
  data?: string | Uint8Array | number[]
}

export interface SvmTransactionOptions {
  signerKeypairPaths?: string[]
  computeUnitLimit?: number
  computeUnitPriceMicroLamports?: bigint
  simulate?: boolean
}

export interface SvmTransactionResult {
  signature?: string
  status: 0 | 1
  slot?: number
  simulated: boolean
  logs?: string[] | null
  unitsConsumed?: number
  raw?: unknown
}

export interface SvmAccountResult {
  address: string
  lamports: bigint
  owner: string
  executable: boolean
  rentEpoch?: bigint
  data: string
}

export interface SvmProgramDeploymentRequest extends SvmTransactionOptions {
  programBytes: Uint8Array
  programKeypairPath: string
  maxDataLength?: number
}

export interface SvmProgramReservationRequest extends SvmTransactionOptions {
  stubBytes: Uint8Array
  finalAuthority: string
  programKeypairPath?: string
  maxDataLength: number
  maxAttempts?: number
}

export interface SvmProgramBufferRequest extends SvmTransactionOptions {
  programBytes: Uint8Array
  finalAuthority: string
}

export interface SvmProgramUpgradeRequest extends SvmTransactionOptions {
  programBytes: Uint8Array
  programId: string
}

export interface SvmProgramDeploymentResult {
  programId: string
  programDataAddress: string
  bufferAddress: string
  signatures: string[]
  slot?: number
  authority?: string | null
  artifactHash?: string
  attempts?: number
}

export interface SvmProgramBufferResult {
  bufferAddress: string
  authority: string
  artifactHash: string
  byteLength: number
  signatures: string[]
  slot?: number
}

export interface SvmPreparedUpgradeResult {
  programId: string
  programDataAddress: string
  bufferAddress: string
  authority: string
  artifactHash: string
  byteLength: number
  instructions: SvmInstructionRequest[]
}

export interface SvmSquadsProposalRequest extends SvmTransactionOptions {
  multisigAddress: string
  vaultIndex: number
  instructions: SvmInstructionRequest[]
  memo?: string
}

export interface SvmSquadsProposalResult extends SvmTransactionResult {
  multisigAddress: string
  vaultAddress: string
  transactionAddress: string
  proposalAddress: string
  transactionIndex: string
}

export interface SvmSquadsExecutionRequest extends SvmTransactionOptions {
  multisigAddress: string
  transactionIndex: bigint
}

export interface SvmProgramVerificationRequest {
  programBytes: Uint8Array
  programId: string
  expectedAuthority?: string | null
  requireVisible?: boolean
}

export interface SvmProgramVerificationResult {
  programId: string
  programDataAddress: string
  authority: string | null
  artifactHash: string
  byteLength: number
  deploymentSlot: number
  currentSlot: number
  visible: boolean
}

export interface SvmChainAdapter extends BaseChainAdapter {
  readonly platform: 'svm'
  readonly executionModel: 'svm'

  getAccount(address: string): Promise<SvmAccountResult | null>
  programExists(address: string): Promise<boolean>
  deriveProgramAddress(programId: string, seeds: Uint8Array[]): { address: string; bump: number }
  deriveAssociatedTokenAddress(owner: string, mint: string, tokenProgramId?: string): string
  sendInstructions(instructions: SvmInstructionRequest[], options?: SvmTransactionOptions): Promise<SvmTransactionResult>
  transfer(to: string, lamports: bigint, options?: SvmTransactionOptions): Promise<SvmTransactionResult>
  deployProgram(request: SvmProgramDeploymentRequest): Promise<SvmProgramDeploymentResult>
  reserveProgram(request: SvmProgramReservationRequest): Promise<SvmProgramDeploymentResult>
  writeProgramBuffer(request: SvmProgramBufferRequest): Promise<SvmProgramBufferResult>
  upgradeProgram(request: SvmProgramUpgradeRequest): Promise<SvmProgramDeploymentResult>
  prepareUpgrade(programBytes: Uint8Array, programId: string, bufferAddress: string): Promise<SvmPreparedUpgradeResult>
  createSquadsProposal(request: SvmSquadsProposalRequest): Promise<SvmSquadsProposalResult>
  executeSquadsTransaction(request: SvmSquadsExecutionRequest): Promise<SvmTransactionResult>
  verifyProgram(request: SvmProgramVerificationRequest): Promise<SvmProgramVerificationResult>
}

export type ChainAdapter = EvmLikeChainAdapter | SvmChainAdapter

export function isEvmLikeAdapter(adapter: ChainAdapter): adapter is EvmLikeChainAdapter {
  return adapter.executionModel === 'evm-like'
}

export function isSvmAdapter(adapter: ChainAdapter): adapter is SvmChainAdapter {
  return adapter.executionModel === 'svm'
}
