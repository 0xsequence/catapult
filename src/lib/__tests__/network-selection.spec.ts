import { resolveSelectedChainIds, resolveSingleChainId } from '../../lib/network-selection'
import { Network } from '../../lib/types'

describe('network-selection', () => {
  const networks: Network[] = [
    { name: 'Mainnet', chainId: 1, rpcUrl: 'https://mainnet' },
    { name: 'Arbitrum One', chainId: 42161, rpcUrl: 'https://arb' },
    { name: 'Polygon', chainId: 137, rpcUrl: 'https://polygon' },
    { name: 'Mainnet', chainId: 10_000, rpcUrl: 'https://fork' },
  ]

  it('returns undefined for empty/undefined input', () => {
    expect(resolveSelectedChainIds(undefined, networks)).toBeUndefined()
    expect(resolveSelectedChainIds('', networks)).toBeUndefined()
    expect(resolveSelectedChainIds('   ', networks)).toBeUndefined()
  })

  it('parses numeric IDs and removes duplicates', () => {
    expect(resolveSelectedChainIds('1,1,42161', networks)).toEqual([1, 42161])
  })

  it('matches names case-insensitively and includes all with same name', () => {
    expect(resolveSelectedChainIds('mainnet', networks)).toEqual([1, 10000])
    expect(resolveSelectedChainIds('MAINNET,polygon', networks)).toEqual([1, 10000, 137])
  })

  it('preserves token order and then network order for name matches', () => {
    expect(resolveSelectedChainIds('polygon,mainnet', networks)).toEqual([137, 1, 10000])
  })

  it('throws on unknown name', () => {
    expect(() => resolveSelectedChainIds('unknown', networks)).toThrow(/Unknown network selector/)
  })

  it('resolveSingleChainId returns first match for name and first token for multi', () => {
    expect(resolveSingleChainId('mainnet', networks)).toBe(1)
    expect(resolveSingleChainId('137,1', networks)).toBe(137)
  })
})


