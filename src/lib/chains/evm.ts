import { ethers } from 'ethers'
import { Network } from '../types/network'
import { DigestSigner, toDigestSigner } from '../core/signer'
import {
  ChainAdapter,
  ChainCallRequest,
  ChainContractCreationRequest,
  ChainCostEstimate,
  ChainNativeValue,
  ChainTransactionReceipt,
  ChainTransactionRequest,
  ChainTransactionResponse,
} from './types'

export class EvmAdapter implements ChainAdapter {
  public readonly platform = 'evm' as const
  public readonly nativeCurrencySymbol = 'ETH'
  public readonly supportsNickMethod = true
  public readonly supportsRawSignedTransactions = true
  public readonly supportsEvmSignatures = true

  public readonly provider: ethers.JsonRpcProvider
  public readonly signer: DigestSigner | Promise<DigestSigner>
  private resolvedSigner?: DigestSigner

  constructor(
    private readonly network: Network,
    private readonly privateKey?: string
  ) {
    this.provider = new ethers.JsonRpcProvider(network.rpcUrl)
    if (privateKey) {
      this.signer = toDigestSigner(new ethers.NonceManager(new ethers.Wallet(privateKey, this.provider)))
    } else if (network.rpcUrl) {
      this.signer = this.provider.getSigner().then(signer => toDigestSigner(new ethers.NonceManager(signer)))
    } else {
      throw new Error('A private key must be provided or an RPC URL must be configured to obtain a signer for the network.')
    }
  }

  public getNetwork(): Network {
    return this.network
  }

  public async getResolvedSigner(): Promise<DigestSigner> {
    if (this.resolvedSigner) return this.resolvedSigner
    this.resolvedSigner = this.signer instanceof Promise ? await this.signer : this.signer
    return this.resolvedSigner
  }

  public async getSignerAddress(): Promise<string> {
    return (await this.getResolvedSigner()).getAddress()
  }

  public async getSignerBalance(): Promise<bigint> {
    return this.provider.getBalance(await this.getSignerAddress())
  }

  public formatNativeValue(value: bigint): string {
    return ethers.formatEther(value)
  }

  public isAddress(value: unknown): value is string {
    return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
  }

  public normalizeAddress(value: string): string {
    if (!this.isAddress(value)) {
      throw new Error(`Invalid EVM address: ${value}`)
    }
    return ethers.getAddress(value.toLowerCase())
  }

  public formatAddress(value: string): string {
    return this.normalizeAddress(value)
  }

  public getBalance(address: string): Promise<bigint> {
    return this.provider.getBalance(this.normalizeAddress(address))
  }

  public async getCode(address: string): Promise<string> {
    return this.provider.getCode(this.normalizeAddress(address))
  }

  public async getStorageAt(address: string, slot: bigint): Promise<string> {
    return ethers.hexlify(await this.provider.getStorage(this.normalizeAddress(address), slot))
  }

  public call(request: ChainCallRequest): Promise<string> {
    return this.provider.call({
      to: this.normalizeAddress(request.to),
      data: request.data
    })
  }

  public async estimateGas(request: ChainTransactionRequest | ChainContractCreationRequest): Promise<bigint> {
    const signer = await this.getResolvedSigner()
    return signer.estimateGas(this.toEthersTransactionRequest(request))
  }

  public async estimateTransactionCost(request: ChainTransactionRequest | ChainContractCreationRequest): Promise<ChainCostEstimate | null> {
    const gasPrice = await this.provider.getFeeData().then(data => data.gasPrice)
    if (gasPrice === null || gasPrice === undefined) return null

    const gasLimit = 'gasLimit' in request && request.gasLimit !== undefined && request.gasLimit !== null
      ? ethers.toBigInt(request.gasLimit)
      : await this.estimateGas(request)
    const requiredBalance = gasLimit * gasPrice + this.toBigIntValue(request.value)
    const signerBalance = await this.getSignerBalance()

    return {
      gasLimit,
      gasPrice,
      requiredBalance,
      signerBalance,
      nativeUnit: this.nativeCurrencySymbol,
      formattedRequired: this.formatNativeValue(requiredBalance),
      formattedBalance: this.formatNativeValue(signerBalance),
    }
  }

  public async sendTransaction(request: ChainTransactionRequest): Promise<ChainTransactionResponse> {
    const signer = await this.getResolvedSigner()
    const tx = await signer.sendTransaction(this.toEthersTransactionRequest(request))
    return {
      hash: tx.hash,
      raw: tx,
      wait: async () => this.normalizeReceipt(await tx.wait())
    }
  }

  public async createContract(request: ChainContractCreationRequest): Promise<ChainTransactionResponse> {
    const signer = await this.getResolvedSigner()
    const tx = await signer.sendTransaction(this.toEthersTransactionRequest(request))
    return {
      hash: tx.hash,
      raw: tx,
      wait: async () => this.normalizeReceipt(await tx.wait())
    }
  }

  public async broadcastSignedTransaction(rawTransaction: string): Promise<ChainTransactionResponse> {
    if (!this.supportsRawSignedTransactions) {
      throw new Error('send-signed-transaction is not supported on EVM adapter configuration.')
    }
    const tx = await this.provider.broadcastTransaction(rawTransaction)
    return {
      hash: tx.hash,
      raw: tx,
      wait: async () => this.normalizeReceipt(await tx.wait())
    }
  }

  public async dispose(): Promise<void> {
    try {
      if ((this.provider as any).destroy) {
        await (this.provider as any).destroy()
      }
    } catch {
      // Ignore cleanup errors.
    }
  }

  private toEthersTransactionRequest(request: ChainTransactionRequest | ChainContractCreationRequest): ethers.TransactionRequest {
    const data = request.data || '0x'
    const value = this.toBigIntValue(request.value)
    const tx: ethers.TransactionRequest = {
      to: 'to' in request ? this.normalizeAddress(request.to) : null,
      data,
      value,
    }
    if (request.gasLimit !== undefined) {
      tx.gasLimit = request.gasLimit
    }
    return tx
  }

  private toBigIntValue(value: ChainNativeValue | undefined): bigint {
    if (value === undefined || value === null) return 0n
    return ethers.toBigInt(value)
  }

  private normalizeReceipt(receipt: ethers.TransactionReceipt | null): ChainTransactionReceipt | null {
    if (!receipt) return null
    return {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      contractAddress: receipt.contractAddress,
      raw: receipt,
    }
  }
}
