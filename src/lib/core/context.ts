import { ethers } from 'ethers'
import { Network } from '../types'
import { ContractRepository } from '../contracts/repository'
import { DigestSigner } from './signer'
import { ChainAdapter, createChainAdapter, EvmAdapter } from '../chains'

export class ExecutionContext {
 public readonly adapter: ChainAdapter
 public readonly provider?: ethers.JsonRpcProvider
 public readonly signer?: DigestSigner | Promise<DigestSigner> // Allow Promise for implicit signer
 public readonly contractRepository: ContractRepository
 private outputs: Map<string, any> = new Map()
 private network: Network
 private etherscanApiKey?: string
 private currentContextPath?: string
 private resolvedSigner?: DigestSigner // Cache for resolved signer

  // Constants registries
  private topLevelConstants: Map<string, any> = new Map()
  private jobConstants: Map<string, any> = new Map()

 constructor(
   network: Network,
   privateKey: string | undefined, // Make privateKey optional
   contractRepository: ContractRepository,
   etherscanApiKey?: string,
   topLevelConstants?: Map<string, any>
 ) {
   this.network = network
   this.adapter = createChainAdapter(network, privateKey)
   if (this.adapter instanceof EvmAdapter) {
     this.provider = this.adapter.provider
     this.signer = this.adapter.signer
   }
   this.contractRepository = contractRepository
   this.etherscanApiKey = etherscanApiKey
   if (topLevelConstants) {
     this.topLevelConstants = new Map(topLevelConstants)
   }
 }

 /**
  * Get the resolved signer, handling both direct signers and promised signers
  */
 public async getResolvedSigner(): Promise<DigestSigner> {
   if (this.resolvedSigner) {
     return this.resolvedSigner
   }

   if (this.adapter instanceof EvmAdapter) {
     this.resolvedSigner = await this.adapter.getResolvedSigner()
     return this.resolvedSigner
   }

   if (!this.signer) {
     throw new Error(`Platform "${this.adapter.platform}" does not support EVM-style signing actions.`)
   }

   if (this.signer instanceof Promise) {
     this.resolvedSigner = await this.signer
     return this.resolvedSigner
   } else {
     this.resolvedSigner = this.signer
     return this.resolvedSigner
   }
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

  // Constants management
  public setJobConstants(constants?: Record<string, any>): void {
    this.jobConstants = new Map(Object.entries(constants || {}))
  }

  public getConstant(name: string): any | undefined {
    // Resolution order: job-level constants override top-level
    if (this.jobConstants.has(name)) return this.jobConstants.get(name)
    if (this.topLevelConstants.has(name)) return this.topLevelConstants.get(name)
    return undefined
  }

  /**
   * Cleanup method to properly dispose of provider connections.
   * This should be called when the context is no longer needed to prevent hanging connections.
   */
  public async dispose(): Promise<void> {
    try {
      // Destroy the provider to close any open connections
      await this.adapter.dispose()
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}
