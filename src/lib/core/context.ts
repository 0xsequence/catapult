import { ethers } from 'ethers'
import { Network } from '../types'
import { ArtifactRegistry } from '../artifacts/registry'

export class ExecutionContext {
  public readonly provider: ethers.JsonRpcProvider
  public readonly signer: ethers.Wallet
  public readonly artifactRegistry: ArtifactRegistry
  private outputs: Map<string, any> = new Map()
  private network: Network
  private etherscanApiKey?: string

  constructor(
    network: Network, 
    privateKey: string, 
    artifactRegistry: ArtifactRegistry,
    etherscanApiKey?: string
  ) {
    this.network = network
    this.provider = new ethers.JsonRpcProvider(network.rpcUrl)
    this.signer = new ethers.Wallet(privateKey, this.provider)
    this.artifactRegistry = artifactRegistry
    this.etherscanApiKey = etherscanApiKey
  }

  public getNetwork(): Network {
    return this.network
  }

  public getEtherscanApiKey(): string | undefined {
    return this.etherscanApiKey
  }

  public getArtifactRegistry(): ArtifactRegistry {
    return this.artifactRegistry
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
}