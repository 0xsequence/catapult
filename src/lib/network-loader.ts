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
    (!('testnet' in obj) || typeof (obj as Record<string, unknown>).testnet === 'boolean') &&
    // evmVersion field is optional and should be a string if present
    (!('evmVersion' in obj) || typeof (obj as Record<string, unknown>).evmVersion === 'string') &&
    // custom field is optional and should be an object map (non-null) if present
    (!('custom' in obj) ||
      (typeof (obj as Record<string, unknown>).custom === 'object' &&
        (obj as Record<string, unknown>).custom !== null &&
        !Array.isArray((obj as Record<string, unknown>).custom)))
  )
}

function resolveRpcUrlTokens(rpcUrl: string): string {
  // Replace placeholders like {{RPC_SOMETHING}} with process.env.RPC_SOMETHING
  // Only tokens starting with "RPC" are considered. Others are left as-is.
  const TOKEN_REGEX = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g
  return rpcUrl.replace(TOKEN_REGEX, (match: string, varName: string) => {
    if (!varName.startsWith('RPC')) {
      // Leave non-RPC tokens intact
      return match
    }
    const value = process.env[varName]
    if (typeof value === 'undefined') {
      // Default to empty string if missing
      return ''
    }
    return value
  })
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
      // Resolve RPC URL tokens using environment variables
      const resolvedRpcUrl = resolveRpcUrlTokens(item.rpcUrl)
      networks.push({ ...item, rpcUrl: resolvedRpcUrl })
    }
    return networks
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      const errWithCode = error as { code?: unknown }
      if (errWithCode.code === 'ENOENT') {
        // It's okay if the file doesn't exist, just return an empty array.
        return []
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load or parse networks.yaml: ${message}`)
  }
}