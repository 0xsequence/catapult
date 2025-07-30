import { ethers } from 'ethers'
import { Network } from '../types'
import { ContractRepository } from '../contracts/repository'

export class ExecutionContext {
  public readonly provider: ethers.JsonRpcProvider
  public readonly signer: ethers.Wallet
  public readonly contractRepository: ContractRepository
  private outputs: Map<string, any> = new Map()
  private network: Network
  private etherscanApiKey?: string
  private currentContextPath?: string

  constructor(
    network: Network, 
    privateKey: string, 
    contractRepository: ContractRepository,
    etherscanApiKey?: string
  ) {
    this.network = network
    this.provider = new ethers.JsonRpcProvider(network.rpcUrl)
    this.signer = new ethers.Wallet(privateKey, this.provider)
    this.contractRepository = contractRepository
    this.etherscanApiKey = etherscanApiKey
  }

  public getNetwork(): Network {
    return this.network
  }

  public getEtherscanApiKey(): string | undefined {
    return this.etherscanApiKey
  }

  public getContractRepository(): ContractRepository {
    return this.contractRepository
  }

  // To store results like `{{sequence-v1.factory.address}}`
  public setOutput(key: string, value: any): void {
    this.outputs.set(key, value)
  }

  // To retrieve results
  public getOutput(key:string): any {
    if (!this.outputs.has(key)) {
      throw new Error(`Output for key "${key}" not found in context. Check dependencies.`)
    }
    return this.outputs.get(key)
  }

  public getOutputs(): Map<string, any> {
    return this.outputs
  }

  // Context path for relative artifact resolution
  public setContextPath(path?: string): void {
    this.currentContextPath = path
  }

  public getContextPath(): string | undefined {
    return this.currentContextPath
  }
}