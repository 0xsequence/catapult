import { getNetworkExcludedJobs, jobPatternToRegex } from '../network-job-filters'
import { DependencyGraph } from '../core/graph'
import { Network } from '../types'

const jobNames = ['erc2470', 'multicall3', 'sequence-v3', 'trails-rc-1', 'trails-utils', 'builder-factories']

const dependencies: Record<string, string[]> = {
  'trails-rc-1': ['erc2470', 'multicall3'],
  'trails-utils': ['erc2470'],
  'builder-factories': ['erc2470'],
}

const graph = {
  getDependencies: (jobName: string) => new Set(dependencies[jobName] ?? []),
} as unknown as DependencyGraph

const network = (filters: Pick<Network, 'onlyJobs' | 'skipJobs'>): Network => ({
  name: 'monad',
  chainId: 143,
  rpcUrl: 'http://127.0.0.1:8545',
  ...filters,
})

describe('jobPatternToRegex', () => {
  it('matches wildcards and escapes regex metacharacters', () => {
    expect(jobPatternToRegex('trails-*').test('trails-rc-1')).toBe(true)
    expect(jobPatternToRegex('trails-rc-?').test('trails-rc-1')).toBe(true)
    expect(jobPatternToRegex('sequence_v3/rc.1').test('sequence_v3/rcx1')).toBe(false)
    expect(jobPatternToRegex('trails').test('trails-rc-1')).toBe(false)
  })
})

describe('getNetworkExcludedJobs', () => {
  it('excludes nothing without filters', () => {
    expect(getNetworkExcludedJobs(network({}), jobNames, graph)).toEqual(new Set())
  })

  it('keeps onlyJobs matches and their dependencies', () => {
    const excluded = getNetworkExcludedJobs(network({ onlyJobs: ['trails-*'] }), jobNames, graph)
    expect(excluded).toEqual(new Set(['sequence-v3', 'builder-factories']))
  })

  it('excludes skipJobs matches', () => {
    const excluded = getNetworkExcludedJobs(network({ skipJobs: ['builder-*', 'sequence-v3'] }), jobNames, graph)
    expect(excluded).toEqual(new Set(['builder-factories', 'sequence-v3']))
  })

  it('applies skipJobs after onlyJobs, including to dependencies', () => {
    const excluded = getNetworkExcludedJobs(network({ onlyJobs: ['trails-*'], skipJobs: ['multicall3'] }), jobNames, graph)
    expect(excluded).toEqual(new Set(['sequence-v3', 'builder-factories', 'multicall3']))
  })

  it('runs only an onlyJobs job when skipJobs removes its dependency', () => {
    const jobs = ['job-a', 'job-b']
    const abGraph = {
      getDependencies: (jobName: string) => new Set(jobName === 'job-a' ? ['job-b'] : []),
    } as unknown as DependencyGraph

    const excluded = getNetworkExcludedJobs(network({ onlyJobs: ['job-a'], skipJobs: ['job-b'] }), jobs, abGraph)
    expect(jobs.filter(name => !excluded.has(name))).toEqual(['job-a'])
  })

  it('ignores patterns that match no job', () => {
    expect(getNetworkExcludedJobs(network({ onlyJobs: ['missing-*'] }), jobNames, graph)).toEqual(new Set(jobNames))
    expect(getNetworkExcludedJobs(network({ skipJobs: ['missing'] }), jobNames, graph)).toEqual(new Set())
  })
})
