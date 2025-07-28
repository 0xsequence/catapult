import * as fs from 'fs/promises'
import * as path from 'path'
import { parse as parseYaml } from 'yaml'
import { Network } from './types'

function isValidNetwork(obj: any): obj is Network {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.name === 'string' &&
    typeof obj.chainId === 'number' &&
    typeof obj.rpcUrl === 'string'
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
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // It's okay if the file doesn't exist, just return an empty array.
      return []
    }
    throw new Error(`Failed to load or parse networks.yaml: ${error.message}`)
  }
}