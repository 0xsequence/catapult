import * as fs from 'fs/promises'
import * as path from 'path'
import { parse as parseYaml } from 'yaml'
import { Network } from './types'

function isValidNetwork(obj: unknown): obj is Network {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    'chainId' in obj &&
    'rpcUrl' in obj &&
    typeof (obj as Record<string, unknown>).name === 'string' &&
    typeof (obj as Record<string, unknown>).chainId === 'number' &&
    typeof (obj as Record<string, unknown>).rpcUrl === 'string' &&
    // supports field is optional and should be an array of strings if present
    (!('supports' in obj) ||
     (Array.isArray((obj as Record<string, unknown>).supports) &&
      ((obj as Record<string, unknown>).supports as unknown[]).every((item: unknown) => typeof item === 'string'))) &&
    // gasLimit field is optional and should be a number if present
    (!('gasLimit' in obj) || typeof (obj as Record<string, unknown>).gasLimit === 'number') &&
    // testnet field is optional and should be a boolean if present
    (!('testnet' in obj) || typeof (obj as Record<string, unknown>).testnet === 'boolean')
  )
}

/**
 * Loads and validates network configurations from a `networks.yaml` file in the project root.
 * @param projectRoot The root directory of the project.
 * @returns A promise that resolves to an array of Network objects.
 * @throws An error if the file exists but is malformed or contains invalid network data.
 */
export async function loadNetworks(projectRoot: string): Promise<Network[]> {
  const filePath = path.join(projectRoot, 'networks.yaml')
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = parseYaml(content)

    if (!Array.isArray(parsed)) {
      throw new Error('networks.yaml must contain an array of network configurations.')
    }

    const networks: Network[] = []
    for (const item of parsed) {
      if (!isValidNetwork(item)) {
        throw new Error(`Invalid network configuration found in networks.yaml: ${JSON.stringify(item)}`)
      }
      networks.push(item)
    }
    return networks
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      // It's okay if the file doesn't exist, just return an empty array.
      return []
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load or parse networks.yaml: ${message}`)
  }
}