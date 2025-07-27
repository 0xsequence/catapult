// src/lib/core/graph.ts
import { Job, Template, isJobCompletedCondition } from '../types'
import { isPrimitiveActionType } from '../types/actions'

/**
 * Represents the complete dependency graph of all jobs in a project.
 * It is responsible for parsing job and template dependencies, detecting
 * cycles, and providing a valid execution order.
 */
export class DependencyGraph {
  private graph: Map<string, Set<string>> = new Map()
  private executionOrder: string[] = []
  private allJobNames: Set<string>

  constructor(
    private readonly jobs: Map<string, Job>,
    private readonly templates: Map<string, Template>,
  ) {
    this.allJobNames = new Set(this.jobs.keys())
    this.build()
    this.checkForCycles()
    this.executionOrder = this.topologicalSort()
  }

  /**
   * Returns the list of job names in a valid execution order.
   * Jobs with no dependencies come first.
   */
  public getExecutionOrder(): string[] {
    return this.executionOrder
  }

  /**
   * Returns the direct and transitive dependencies for a given job.
   */
  public getDependencies(jobName: string): Set<string> {
    return this.graph.get(jobName) || new Set()
  }

  /**
   * Populates the dependency graph by analyzing each job.
   */
  private build(): void {
    for (const jobName of this.allJobNames) {
      this.graph.set(jobName, this.findAllDependencies(jobName))
    }
  }

  /**
   * Recursively finds all dependencies for a given job, including those
   * from its `depends_on` list and those hidden within its templates' setup blocks.
   *
   * @param jobName The name of the job to analyze.
   * @param visited A set to track visited jobs in the current path to detect cycles.
   * @returns A set of all job names that the given job depends on.
   */
  private findAllDependencies(jobName: string, visited: Set<string> = new Set()): Set<string> {
    if (visited.has(jobName)) {
      // This path is cyclic. The cycle will be properly reported by `checkForCycles`.
      // Here, we just stop the recursion to prevent an infinite loop.
      return new Set()
    }
    visited.add(jobName)

    const job = this.jobs.get(jobName)
    if (!job) {
      throw new Error(`Integrity error: Job "${jobName}" not found during graph build.`)
    }

    const directDependencies = new Set<string>()

    // 1. Add dependencies from the job's `depends_on` field.
    job.depends_on?.forEach(dep => directDependencies.add(dep))

    // 2. Find dependencies within the templates used by the job's actions.
    for (const action of job.actions) {
      // If the action is a primitive, it cannot have job dependencies. Skip it.
      if (isPrimitiveActionType(action.template)) {
        continue
      }
      
      const template = this.templates.get(action.template)
      if (!template) {
        throw new Error(`Invalid configuration: Template "${action.template}" used by job "${jobName}" not found.`)
      }

      // Recursively find dependencies in the template's setup block.
      this.findTemplateSetupDependencies(template).forEach(dep => directDependencies.add(dep))
    }

    // 3. Now, for each direct dependency, find its transitive dependencies.
    const allDependencies = new Set<string>(directDependencies)
    for (const dep of directDependencies) {
      if (!this.allJobNames.has(dep)) {
        throw new Error(`Invalid dependency: Job "${jobName}" depends on "${dep}", which does not exist.`)
      }
      // The `visited` set is passed down to detect cycles across calls.
      const transitiveDeps = this.findAllDependencies(dep, new Set(visited))
      transitiveDeps.forEach(transDep => allDependencies.add(transDep))
    }

    return allDependencies
  }

  /**
   * Helper to extract job dependencies from a template's setup block.
   */
  private findTemplateSetupDependencies(template: Template): Set<string> {
    const dependencies = new Set<string>()
    const setup = template.setup
    if (!setup) return dependencies

    // Case 1: Dependencies from `skip_condition` (e.g., `job-completed`).
    setup.skip_condition?.forEach(condition => {
      if (isJobCompletedCondition(condition)) {
        dependencies.add(condition.arguments.job)
      }
    })

    // Case 2: Dependencies from setup actions that are themselves templates.
    setup.actions?.forEach(action => {
      // Ignore primitive actions within a setup block.
      if (isPrimitiveActionType(action.type)) {
        return
      }

      // In your YAML, setup blocks sometimes call other templates directly.
      // e.g. `sequence-universal-deployer-2`'s setup calls `nano-universal-deployer`
      // Here, `action.type` IS the template name.
      const actionTemplate = this.templates.get(action.type)
      if (actionTemplate) {
        // This is a nested template call, so we must find its dependencies too.
        this.findTemplateSetupDependencies(actionTemplate).forEach(dep => dependencies.add(dep))
      }
    })

    return dependencies
  }

  /**
   * Checks the entire graph for circular dependencies.
   * @throws {Error} if a cycle is detected.
   */
  private checkForCycles(): void {
    for (const [jobName, dependencies] of this.graph.entries()) {
      if (dependencies.has(jobName)) {
        // To provide a more helpful error, we need to find the actual path.
        const path = this.findPath(jobName, jobName)
        throw new Error(`Circular dependency detected: ${path.join(' -> ')}`)
      }
    }
  }

  /**
   * Helper to find a dependency path from a start node to an end node.
   * Used for creating helpful error messages for cycles.
   */
  private findPath(start: string, end: string, visited: Set<string> = new Set()): string[] {
    visited.add(start)
    const job = this.jobs.get(start)
    if (!job) return []

    const directDependencies = new Set(job.depends_on || [])
    for (const action of job.actions) {
      if (isPrimitiveActionType(action.template)) {
        continue
      }
      const template = this.templates.get(action.template)!
      this.findTemplateSetupDependencies(template).forEach(dep => directDependencies.add(dep))
    }
    
    if (directDependencies.has(end)) {
        return [start, end]
    }

    for (const dep of directDependencies) {
        if (!visited.has(dep)) {
            const path = this.findPath(dep, end, visited)
            if (path.length > 0) {
                return [start, ...path]
            }
        }
    }

    return []
  }

  /**
   * Performs a topological sort on the graph to determine execution order.
   * Uses Kahn's algorithm.
   */
  private topologicalSort(): string[] {
    const inDegree = new Map<string, number>()
    const sorted: string[] = []

    // This map stores which jobs depend on a given key.
    // e.g., `adjacency.get('A')` -> `['B', 'C']` means B and C depend on A.
    const adjacency = new Map<string, string[]>()

    // Initialize in-degrees and adjacency list for all jobs.
    for (const jobName of this.allJobNames) {
      inDegree.set(jobName, 0)
      adjacency.set(jobName, [])
    }
    
    // Build the inverted graph (adjacency list) and calculate initial in-degrees.
    for (const [jobName, dependencies] of this.graph.entries()) {
      inDegree.set(jobName, dependencies.size)
      for (const dep of dependencies) {
        // `jobName` depends on `dep`, so `dep` is a prerequisite for `jobName`.
        adjacency.get(dep)?.push(jobName)
      }
    }

    // Initialize queue with nodes having an in-degree of 0.
    const queue: string[] = []
    for (const [jobName, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(jobName)
      }
    }

    // Process the queue.
    while (queue.length > 0) {
      const current = queue.shift()!
      sorted.push(current)
      
      const dependents = adjacency.get(current) || []
      for (const dependent of dependents) {
        const newDegree = (inDegree.get(dependent) || 1) - 1
        inDegree.set(dependent, newDegree)
        if (newDegree === 0) {
          queue.push(dependent)
        }
      }
    }

    if (sorted.length !== this.allJobNames.size) {
      // This should theoretically be caught by `checkForCycles`, but it's good defense.
      throw new Error('Topological sort failed. The graph likely has a cycle.')
    }

    return sorted
  }
}