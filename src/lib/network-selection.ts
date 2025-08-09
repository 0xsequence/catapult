import { Network } from './types'

/**
 * Parses a comma-separated selector string into chain IDs, supporting numeric IDs and network names.
 * - Numeric tokens (e.g., "1") are treated as chain IDs
 * - String tokens (e.g., "mainnet") are matched against Network.name case-insensitively
 * - When a name matches multiple networks, all of them are included
 * - Order is preserved by token then by appearance order in `networks`
 * - Duplicates are removed
 *
 * Throws if any token cannot be resolved to at least one chain ID.
 */
export function resolveSelectedChainIds(
  selectors: string | undefined,
  networks: Network[]
): number[] | undefined {
  if (selectors == null) return undefined
  const normalized = String(selectors).trim()
  if (normalized.length === 0) return undefined

  const tokens = normalized
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)

  if (tokens.length === 0) return undefined

  const result: number[] = []
  const seen = new Set<number>()

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const id = Number(token)
      if (!seen.has(id)) {
        seen.add(id)
        result.push(id)
      }
      continue
    }

    const tokenLc = token.toLowerCase()
    const matches = networks.filter(n => n.name.toLowerCase() === tokenLc)
    if (matches.length === 0) {
      const available = Array.from(new Set(networks.map(n => n.name))).sort()
      throw new Error(
        `Unknown network selector "${token}". Use a chain ID (e.g., 1) or a network name. Available names: ${available.join(', ')}`
      )
    }
    for (const net of matches) {
      if (!seen.has(net.chainId)) {
        seen.add(net.chainId)
        result.push(net.chainId)
      }
    }
  }

  return result
}

/**
 * Resolves a single selector into one chain ID. If a name maps to multiple networks,
 * returns the first matching network in the order provided.
 */
export function resolveSingleChainId(
  selector: string | undefined,
  networks: Network[]
): number | undefined {
  const ids = resolveSelectedChainIds(selector, networks)
  if (!ids || ids.length === 0) return undefined
  return ids[0]
}


