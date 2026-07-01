import { ethers } from 'ethers'
import { TronWeb } from 'tronweb'
import { Network } from '../types/network'
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

type TronSignedTransaction = Record<string, unknown> & {
  txID?: string
  contract_address?: string
}

export class TronAdapter implements ChainAdapter {
  public readonly platform = 'tron' as const
  public readonly nativeCurrencySymbol = 'TRX'
  public readonly supportsNickMethod = false
  public readonly supportsRawSignedTransactions = false
  public readonly supportsEvmSignatures = false

  private readonly tronWeb: TronWeb
  private readonly feeLimit: number
  private readonly receiptTimeoutMs: number
  private readonly receiptPollMs: number
  private cachedEnergyFeeSun?: number | null

  constructor(
    private readonly network: Network,
    private readonly privateKey?: string
  ) {
    const params = network.params || {}
    this.feeLimit = this.getNumberParam(params, 'feeLimit', 150_000_000)
    this.receiptTimeoutMs = this.getNumberParam(params, 'receiptTimeoutMs', 120_000)
    this.receiptPollMs = this.getNumberParam(params, 'receiptPollMs', 3_000)

    this.tronWeb = new TronWeb({
      fullHost: network.rpcUrl,
      privateKey,
    })

    const apiKeyEnv = typeof params.tronGridApiKeyEnv === 'string' ? params.tronGridApiKeyEnv : undefined
    const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : undefined
    if (apiKey) {
      this.tronWeb.setHeader({ 'TRON-PRO-API-KEY': apiKey })
    }
  }

  public getNetwork(): Network {
    return this.network
  }

  public async getSignerAddress(): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Tron deployments require a private key; implicit RPC signers are not supported.')
    }
    const address = this.tronWeb.address.fromPrivateKey(this.privateKey)
    if (!address) {
      throw new Error('Unable to derive Tron address from private key.')
    }
    return this.normalizeAddress(address)
  }

  public async getSignerBalance(): Promise<bigint> {
    return this.getBalance(await this.getSignerAddress())
  }

  public formatNativeValue(value: bigint): string {
    return this.formatSun(value)
  }

  public isAddress(value: unknown): value is string {
    if (typeof value !== 'string') return false
    return /^0x[a-fA-F0-9]{40}$/.test(value) || this.tronWeb.isAddress(value)
  }

  public normalizeAddress(value: string): string {
    if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
      return ethers.getAddress(value.toLowerCase())
    }
    if (!this.tronWeb.isAddress(value)) {
      throw new Error(`Invalid Tron address: ${value}`)
    }
    const tronHex = this.tronWeb.address.toHex(value)
    return this.canonicalFromTronHex(tronHex)
  }

  public formatAddress(value: string): string {
    return this.normalizeAddress(value)
  }

  public async getBalance(address: string): Promise<bigint> {
    const balance = await this.tronWeb.trx.getBalance(this.toTronAddress(address))
    return BigInt(balance)
  }

  public async getCode(address: string): Promise<string> {
    try {
      const contract = await this.tronWeb.trx.getContract(this.toTronAddress(address))
      const bytecode = typeof contract?.bytecode === 'string' ? contract.bytecode : ''
      return bytecode.length > 0 ? this.ensure0x(bytecode) : '0x'
    } catch (error) {
      if (this.isContractLookupMiss(error)) {
        return '0x'
      }
      throw error
    }
  }

  public async getStorageAt(_address: string, _slot: bigint): Promise<string> {
    throw new Error('get-storage-at is not implemented for Tron networks.')
  }

  public async call(request: ChainCallRequest): Promise<string> {
    const owner = await this.getTronCallOwnerAddress()
    const result = await this.tronWeb.transactionBuilder.triggerConstantContract(
      this.toTronAddress(request.to),
      '',
      {
        input: this.strip0x(request.data),
        feeLimit: this.getFeeLimit(),
      },
      [],
      owner
    )

    if (result.Error || result.result?.result === false) {
      throw new Error(`Tron constant call failed: ${result.Error || result.result?.message || 'unknown error'}`)
    }

    const [firstResult] = result.constant_result || []
    return firstResult ? this.ensure0x(String(firstResult)) : '0x'
  }

  public async estimateGas(request: ChainTransactionRequest | ChainContractCreationRequest): Promise<bigint> {
    const feeLimit = this.getFeeLimit(request.gasLimit)

    if (!('to' in request) || !request.data || request.data === '0x') {
      return BigInt(feeLimit)
    }

    const owner = await this.getTronCallOwnerAddress()
    const estimate = await this.tronWeb.transactionBuilder.estimateEnergy(
      this.toTronAddress(request.to),
      '',
      {
        input: this.strip0x(request.data),
        feeLimit: this.getFeeLimit(request.gasLimit),
      },
      [],
      owner
    )
    if (estimate.result?.result === false) {
      throw new Error(`Unable to estimate Tron energy: ${(estimate as any).result?.message || 'unknown error'}`)
    }

    const energyRequired = BigInt(estimate.energy_required || 0)
    if (energyRequired <= 0n) {
      return BigInt(feeLimit)
    }

    const energyFeeSun = await this.getEnergyFeeSun()
    return energyFeeSun === undefined ? BigInt(feeLimit) : energyRequired * BigInt(energyFeeSun)
  }

  public async estimateTransactionCost(request: ChainTransactionRequest | ChainContractCreationRequest): Promise<ChainCostEstimate> {
    const value = this.toSun(request.value)
    const feeLimit = this.getFeeLimit(request.gasLimit)
    const requiredBalance = BigInt(feeLimit) + value
    const signerBalance = await this.getSignerBalance()
    return {
      gasLimit: BigInt(feeLimit),
      requiredBalance,
      signerBalance,
      nativeUnit: this.nativeCurrencySymbol,
      formattedRequired: this.formatNativeValue(requiredBalance),
      formattedBalance: this.formatNativeValue(signerBalance),
    }
  }

  public async sendTransaction(request: ChainTransactionRequest): Promise<ChainTransactionResponse> {
    this.requirePrivateKey()
    const value = this.toSafeSunNumber(request.value)

    if (!request.data || request.data === '0x') {
      if (value <= 0) {
        throw new Error('Tron transfer requires a positive value when no contract call data is supplied.')
      }
      const result = await this.tronWeb.trx.sendTransaction(this.toTronAddress(request.to), value, {
        privateKey: this.privateKey,
      })
      return this.responseFromBroadcast(result.txid, result.transaction as unknown as TronSignedTransaction)
    }

    const wrapper = await this.tronWeb.transactionBuilder.triggerSmartContract(
      this.toTronAddress(request.to),
      '',
      {
        input: this.strip0x(request.data),
        feeLimit: this.getFeeLimit(request.gasLimit),
        callValue: value,
      },
      [],
      await this.getTronSignerAddress()
    )

    if (wrapper.Error || wrapper.result?.result === false || !wrapper.transaction) {
      throw new Error(`Unable to build Tron smart contract transaction: ${wrapper.Error || wrapper.result?.message || 'unknown error'}`)
    }

    const signed = await this.tronWeb.trx.sign(wrapper.transaction, this.privateKey)
    const broadcast = await this.tronWeb.trx.sendRawTransaction(signed)
    if (!broadcast.result) {
      throw new Error(`Unable to broadcast Tron transaction: ${broadcast.message || broadcast.code || 'unknown error'}`)
    }
    return this.responseFromBroadcast(broadcast.txid || signed.txID, signed as unknown as TronSignedTransaction)
  }

  public async createContract(request: ChainContractCreationRequest): Promise<ChainTransactionResponse> {
    this.requirePrivateKey()
    const params = this.network.params || {}
    const owner = await this.getTronSignerAddress()
    const tx = await this.tronWeb.transactionBuilder.createSmartContract(
      {
        abi: this.getContractAbi(request) as any,
        bytecode: this.strip0x(request.data),
        feeLimit: this.getFeeLimit(request.gasLimit),
        callValue: this.toSafeSunNumber(request.value),
        userFeePercentage: this.getNumberParam(params, 'userFeePercentage', 100),
        originEnergyLimit: this.getNumberParam(params, 'originEnergyLimit', 10_000_000),
        name: typeof params.contractName === 'string' ? params.contractName : undefined,
      },
      owner
    )
    const signed = await this.tronWeb.trx.sign(tx, this.privateKey)
    const broadcast = await this.tronWeb.trx.sendRawTransaction(signed)
    if (!broadcast.result) {
      throw new Error(`Unable to broadcast Tron contract creation: ${broadcast.message || broadcast.code || 'unknown error'}`)
    }
    return this.responseFromBroadcast(broadcast.txid || signed.txID, signed as unknown as TronSignedTransaction)
  }

  public async broadcastSignedTransaction(_rawTransaction: string): Promise<ChainTransactionResponse> {
    throw new Error('send-signed-transaction is not implemented for Tron networks. Tron signed transactions are structured objects, not Ethereum raw RLP bytes.')
  }

  public async dispose(): Promise<void> {
    // TronWeb uses HTTP providers and does not expose a connection teardown hook.
  }

  private async getTronSignerAddress(): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Tron deployments require a private key; implicit RPC signers are not supported.')
    }
    const address = this.tronWeb.address.fromPrivateKey(this.privateKey)
    if (!address) {
      throw new Error('Unable to derive Tron address from private key.')
    }
    return this.toTronAddress(address)
  }

  private async getTronCallOwnerAddress(): Promise<string> {
    if (!this.privateKey) {
      return this.toTronAddress('0x0000000000000000000000000000000000000000')
    }
    return this.getTronSignerAddress()
  }

  private responseFromBroadcast(hash: string | undefined, transaction: TronSignedTransaction): ChainTransactionResponse {
    if (!hash) {
      throw new Error('Tron broadcast did not return a transaction hash.')
    }
    return {
      hash,
      raw: transaction,
      wait: async () => this.waitForReceipt(hash, transaction)
    }
  }

  private async waitForReceipt(hash: string, transaction: TronSignedTransaction): Promise<ChainTransactionReceipt> {
    const startedAt = Date.now()
    let lastInfo: any
    while (Date.now() - startedAt <= this.receiptTimeoutMs) {
      lastInfo = await this.tronWeb.trx.getUnconfirmedTransactionInfo(hash)
      if (lastInfo && Object.keys(lastInfo).length > 0) {
        const receiptResult = typeof lastInfo.receipt?.result === 'string' ? lastInfo.receipt.result : undefined
        const hasBlockNumber = lastInfo.blockNumber !== undefined && lastInfo.blockNumber !== null
        if (!receiptResult && !hasBlockNumber) {
          await new Promise(resolve => setTimeout(resolve, this.receiptPollMs))
          continue
        }

        const success = !receiptResult || receiptResult === 'SUCCESS'
        const rawAddress = lastInfo.contract_address || transaction.contract_address
        return {
          status: success ? 1 : 0,
          blockNumber: lastInfo.blockNumber,
          contractAddress: rawAddress ? this.normalizeAddress(String(rawAddress)) : null,
          raw: lastInfo,
        }
      }
      await new Promise(resolve => setTimeout(resolve, this.receiptPollMs))
    }
    throw new Error(`Timed out waiting for Tron transaction receipt ${hash}`)
  }

  private requirePrivateKey(): void {
    if (!this.privateKey) {
      throw new Error('Tron deployments require a private key; implicit RPC signers are not supported.')
    }
  }

  private toTronAddress(address: string): string {
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return `41${address.slice(2)}`
    }
    if (!this.tronWeb.isAddress(address)) {
      throw new Error(`Invalid Tron address: ${address}`)
    }
    return this.tronWeb.address.toHex(address)
  }

  private canonicalFromTronHex(value: string): string {
    const hex = value.startsWith('0x') ? value.slice(2) : value
    if (!/^41[0-9a-fA-F]{40}$/.test(hex)) {
      throw new Error(`Invalid Tron hex address: ${value}`)
    }
    return ethers.getAddress(`0x${hex.slice(2)}`)
  }

  private strip0x(value: string): string {
    return value.startsWith('0x') ? value.slice(2) : value
  }

  private ensure0x(value: string): string {
    return value.startsWith('0x') ? value : `0x${value}`
  }

  private toSun(value: ChainNativeValue | undefined): bigint {
    if (value === undefined || value === null) return 0n
    return ethers.toBigInt(value)
  }

  private toSafeSunNumber(value: ChainNativeValue | undefined): number {
    const sun = this.toSun(value)
    if (sun > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Tron value ${sun.toString()} exceeds JavaScript safe integer range.`)
    }
    return Number(sun)
  }

  private getFeeLimit(gasLimit?: ethers.BigNumberish): number {
    if (gasLimit === undefined || gasLimit === null) {
      return this.feeLimit
    }
    const feeLimit = ethers.toBigInt(gasLimit)
    if (feeLimit <= 0n) {
      throw new Error(`Tron feeLimit must be a positive integer, got ${feeLimit.toString()}.`)
    }
    if (feeLimit > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Tron feeLimit ${feeLimit.toString()} exceeds JavaScript safe integer range.`)
    }
    return Number(feeLimit)
  }

  private async getEnergyFeeSun(): Promise<number | undefined> {
    if (this.cachedEnergyFeeSun !== undefined) {
      return this.cachedEnergyFeeSun ?? undefined
    }

    const params = this.network.params || {}
    if (params.energyFeeSun !== undefined) {
      this.cachedEnergyFeeSun = this.getPositiveIntegerParam(params, 'energyFeeSun')
      return this.cachedEnergyFeeSun
    }

    try {
      const chainParameters = await this.tronWeb.trx.getChainParameters()
      const energyFee = chainParameters.find(parameter => parameter.key === 'getEnergyFee')?.value
      if (typeof energyFee === 'number' && Number.isInteger(energyFee) && energyFee > 0) {
        this.cachedEnergyFeeSun = energyFee
        return this.cachedEnergyFeeSun
      }
    } catch {
      // Some private nodes do not expose chain parameters; callers still get a usable fee limit fallback.
    }

    this.cachedEnergyFeeSun = null
    return undefined
  }

  private getContractAbi(request: ChainContractCreationRequest): unknown[] {
    const abi = request.abi !== undefined
      ? request.abi
      : (this.toSun(request.value) > 0n ? [{ type: 'constructor', stateMutability: 'payable', inputs: [] }] : [])

    if (!Array.isArray(abi)) {
      throw new Error('Tron contract creation ABI must be an array when provided.')
    }

    return abi.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return entry
      }
      const record = entry as Record<string, unknown>
      if (record.type === 'constructor' && typeof record.stateMutability !== 'string') {
        return {
          ...record,
          stateMutability: record.payable === true ? 'payable' : 'nonpayable',
        }
      }
      return entry
    })
  }

  private formatSun(value: bigint): string {
    const sign = value < 0n ? '-' : ''
    const abs = value < 0n ? -value : value
    const whole = abs / 1_000_000n
    const fraction = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
    return `${sign}${whole.toString()}${fraction ? `.${fraction}` : ''}`
  }

  private getNumberParam(params: Record<string, unknown>, key: string, fallback: number): number {
    const value = params[key]
    if (value === undefined) return fallback
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Network params.${key} must be a finite number when provided.`)
    }
    return value
  }

  private getPositiveIntegerParam(params: Record<string, unknown>, key: string): number {
    const value = params[key]
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error(`Network params.${key} must be a positive integer when provided.`)
    }
    return value
  }

  private isContractLookupMiss(error: unknown): boolean {
    return /does not exist|not found|not exist|no contract/i.test(this.errorText(error))
  }

  private errorText(value: unknown, seen = new Set<unknown>()): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return value.toString()
    }
    if (typeof value !== 'object' || seen.has(value)) return ''
    seen.add(value)

    const record = value as Record<string, unknown>
    return [
      record.message,
      record.Error,
      record.error,
      record.code,
      record.response,
      record.data,
      record.result,
    ].map(item => this.errorText(item, seen)).filter(Boolean).join(' ')
  }
}
