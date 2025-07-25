// src/lib/core/context.ts
import { ethers } from 'ethers'
import { Network } from '../types'
import { Artifact } from '../types/artifacts'

export class ExecutionContext {
  public readonly provider: ethers.Provider
  public readonly signer: ethers.Signer

  private readonly outputs: Map<string, any> = new Map()
  private readonly artifacts: Map<string, Artifact> = new Map()

  constructor(network: Network, privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(network.rpcUrl)
    this.signer = new ethers.Wallet(privateKey, this.provider)
  }

  // To store results like `{{sequence-v1.factory.address}}`
  public setOutput(key: string, value: any): void {
    this.outputs.set(key, value)
  }

  // To retrieve results
  public getOutput(key: string): any {
    if (!this.outputs.has(key)) {
      throw new Error(`Output for key "${key}" not found in context. Check dependencies.`)
    }
    return this.outputs.get(key)
  }

  public setArtifact(key: string, artifact: Artifact): void {
    this.artifacts.set(key, artifact)
  }

  public getArtifact(key: string): Artifact {
    if (!this.artifacts.has(key)) {
      throw new Error(`Artifact for key "${key}" not found in context. Check dependencies.`)
    }
    return this.artifacts.get(key)!
  }
}
