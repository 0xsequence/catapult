import { ethers } from 'ethers'
import { Network } from '../types'
import { ContractRepository } from '../contracts/repository'

export class ExecutionContext {
 public readonly provider: ethers.JsonRpcProvider
 public readonly signer: ethers.Signer | Promise<ethers.Signer> // Allow Promise for implicit signer
 public readonly contractRepository: ContractRepository
 private outputs: Map<string, any> = new Map()
 private network: Network
 private etherscanApiKey?: string
 private currentContextPath?: string
 private resolvedSigner?: ethers.Signer // Cache for resolved signer

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
   this.provider = new ethers.JsonRpcProvider(network.rpcUrl)
   this.contractRepository = contractRepository
   this.etherscanApiKey = etherscanApiKey
   if (topLevelConstants) {
     this.topLevelConstants = new Map(topLevelConstants)
   }

   // Determine the signer
   if (privateKey) {
     this.signer = new ethers.Wallet(privateKey, this.provider)
   } else if (network.rpcUrl) {
     // If no private key, but RPC URL is provided, get a signer from the provider.
     // This returns a Promise that we need to resolve on first use.
     this.signer = this.provider.getSigner() // Keep as Promise
   } else {
     throw new Error('A private key must be provided or an RPC URL must be configured to obtain a signer for the network.')
   }
 }

 /**
  * Get the resolved signer, handling both direct signers and promised signers
  */
 public async getResolvedSigner(): Promise<ethers.Signer> {
   if (this.resolvedSigner) {
     return this.resolvedSigner
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
      if (this.provider && typeof (this.provider as any).destroy === 'function') {
        await (this.provider as any).destroy()
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
}