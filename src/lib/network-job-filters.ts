import { DependencyGraph } from './core/graph'
import { Network } from './types'

/**
 * Converts a job name pattern into an anchored regex. `*` matches any run of characters, `?` one character.
 */
export function jobPatternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[-\\^$+?.()|[\]{}*]/g, '\\$&')
    .replace(/\\\*/g, '.*')
    .replace(/\\\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

function matchJobs(patterns: string[], jobNames: string[]): string[] {
  const regexes = patterns.map(jobPatternToRegex)
  return jobNames.filter(name => regexes.some(re => re.test(name)))
}

/**
 * Returns the jobs a network excludes through its `onlyJobs` and `skipJobs` fields.
 * Jobs matched by `onlyJobs` keep their transitive dependencies; `skipJobs` is applied afterwards.
 */
export function getNetworkExcludedJobs(network: Network, jobNames: string[], graph: DependencyGraph): Set<string> {
  const excluded = new Set<string>()

  if (network.onlyJobs && network.onlyJobs.length > 0) {
    const allowed = new Set<string>()
    for (const name of matchJobs(network.onlyJobs, jobNames)) {
      allowed.add(name)
      graph.getDependencies(name).forEach(dep => allowed.add(dep))
    }
    jobNames.filter(name => !allowed.has(name)).forEach(name => excluded.add(name))
  }

  if (network.skipJobs && network.skipJobs.length > 0) {
    matchJobs(network.skipJobs, jobNames).forEach(name => excluded.add(name))
  }

  return excluded
}
