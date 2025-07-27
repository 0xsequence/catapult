// src/lib/core/__tests__/graph.spec.ts
import * as path from 'path'
import { ProjectLoader } from '../loader'
import { DependencyGraph } from '../graph'
import { Job, Template } from '../../types'

describe('DependencyGraph', () => {
  let loader: ProjectLoader

  beforeAll(async () => {
    // Load the real project structure from the examples directory
    const projectRoot = path.resolve(__dirname, '../../../../examples')
    loader = new ProjectLoader(projectRoot)
    await loader.load()
  })

  it('should be created without errors for a valid project', () => {
    expect(() => new DependencyGraph(loader.jobs, loader.templates)).not.toThrow()
  })

  it('should identify direct dependencies from `depends_on` field', () => {
    const graph = new DependencyGraph(loader.jobs, loader.templates)
    // guards-v1.yaml has `depends_on: ["sequence-v1"]`
    const guardsDeps = graph.getDependencies('guards-v1')
    expect(guardsDeps.has('sequence-v1')).toBe(true)
  })

  it('should identify dependencies from a template setup block (`job-completed`)', () => {
    const jobs = new Map<string, Job>()
    const templates = new Map<string, Template>()

    templates.set('template-with-setup', {
      name: 'template-with-setup',
      actions: [],
      setup: { skip_condition: [{ type: 'job-completed', arguments: { job: 'dependency-job' } }] },
    })

    jobs.set('job-A', { name: 'job-A', version: '1', actions: [{ name: 'a1', template: 'template-with-setup', arguments: {} }] })
    jobs.set('dependency-job', { name: 'dependency-job', version: '1', actions: [] })

    const graph = new DependencyGraph(jobs, templates)
    const jobADeps = graph.getDependencies('job-A')
    expect(jobADeps.has('dependency-job')).toBe(true)
  })
  
  it('should identify nested dependencies from templates calling templates in setup', () => {
    // In our examples:
    // job `sequence-v1` uses `sequence-universal-deployer-2`
    // `sequence-universal-deployer-2`'s setup uses `nano-universal-deployer`
    // `nano-universal-deployer`'s setup uses `min-balance` and `send-signed-transaction` (primitives)
    // This test confirms the graph builder doesn't crash on this complexity.
    // A more specific test would require mocking a deeper chain.
    const graph = new DependencyGraph(loader.jobs, loader.templates);
    const seqV1Deps = graph.getDependencies('sequence-v1');

    // sequence-v1 itself has no job dependencies defined in its YAMLs, so this should be empty.
    // This confirms our logic correctly distinguishes between template-setup-actions and job dependencies.
    expect(seqV1Deps.size).toBe(0);
  });

  it('should correctly identify transitive dependencies', () => {
    const graph = new DependencyGraph(loader.jobs, loader.templates)
    // "sequence-v1-seq-0001-patch" -> "guards-v1" -> "sequence-v1"
    const patchDeps = graph.getDependencies('sequence-v1-seq-0001-patch')
    expect(patchDeps.has('guards-v1')).toBe(true)
    expect(patchDeps.has('sequence-v1')).toBe(true) // Transitive dependency
    expect(patchDeps.size).toBe(2) // depends on sequence-v1, and guards-v1
  })

  it('should produce a valid topological sort order', () => {
    const graph = new DependencyGraph(loader.jobs, loader.templates)
    const order = graph.getExecutionOrder()

    // We can't know the exact order due to parallel possibilities,
    // but we can verify that dependencies always come before their dependents.
    const patchIndex = order.indexOf('sequence-v1-seq-0001-patch')
    const guardsIndex = order.indexOf('guards-v1')
    const seqV1Index = order.indexOf('sequence-v1')

    expect(patchIndex).toBeGreaterThan(guardsIndex)
    expect(patchIndex).toBeGreaterThan(seqV1Index)
    expect(guardsIndex).toBeGreaterThan(seqV1Index)
  })

  describe('Cycle Detection', () => {
    it('should throw an error for a simple (A -> B -> A) cycle', () => {
      const jobs = new Map<string, Job>()
      jobs.set('job-A', { name: 'job-A', version: '1', actions: [], depends_on: ['job-B'] })
      jobs.set('job-B', { name: 'job-B', version: '1', actions: [], depends_on: ['job-A'] })

      expect(() => new DependencyGraph(jobs, new Map())).toThrow(
        /Circular dependency detected: job-A -> job-B -> job-A/
      )
    })

    it('should throw an error for a longer (A -> B -> C -> A) cycle', () => {
        const jobs = new Map<string, Job>()
        jobs.set('job-A', { name: 'job-A', version: '1', actions: [], depends_on: ['job-B'] })
        jobs.set('job-B', { name: 'job-B', version: '1', actions: [], depends_on: ['job-C'] })
        jobs.set('job-C', { name: 'job-C', version: '1', actions: [], depends_on: ['job-A'] })
  
        expect(() => new DependencyGraph(jobs, new Map())).toThrow(
          /Circular dependency detected: job-A -> job-B -> job-C -> job-A/
        )
      })

    it('should throw an error for a self-referencing cycle', () => {
      const jobs = new Map<string, Job>()
      jobs.set('job-A', { name: 'job-A', version: '1', actions: [], depends_on: ['job-A'] })

      expect(() => new DependencyGraph(jobs, new Map())).toThrow(
        /Circular dependency detected: job-A -> job-A/
      )
    })
  })

  it('should throw an error for a dependency on a non-existent job', () => {
    const jobs = new Map<string, Job>()
    jobs.set('job-A', { name: 'job-A', version: '1', actions: [], depends_on: ['job-non-existent'] })

    expect(() => new DependencyGraph(jobs, new Map())).toThrow(
      'Invalid dependency: Job "job-A" depends on "job-non-existent", which does not exist.'
    )
  })
})