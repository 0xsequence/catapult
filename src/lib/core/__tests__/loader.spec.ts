import * as fs from 'fs/promises'
import * as path from 'path'
import { randomBytes } from 'crypto'
import { ProjectLoader } from '../loader'
import { Job, Template } from '../../types'

describe('ProjectLoader', () => {
  let tempDir: string
  let testRunId: string
  let baseTestDir: string

  beforeAll(() => {
    // Generate unique test run ID
    testRunId = `test_${Date.now()}_${randomBytes(4).toString('hex')}`
    baseTestDir = `/tmp/catapult_testing/${testRunId}`
  })

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    const testId = randomBytes(4).toString('hex')
    tempDir = path.join(baseTestDir, testId)
    await fs.mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up individual test directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors for individual tests
    }
  })

  afterAll(async () => {
    // Clean up entire test run directory as safety net
    try {
      await fs.rm(baseTestDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('job loading', () => {
    it('should load jobs from the root jobs directory', async () => {
      const jobsDir = path.join(tempDir, 'jobs')
      await fs.mkdir(jobsDir, { recursive: true })

      const jobYaml = `name: "test-job"
version: "1"
description: "A test job"
depends_on: []
actions:
  - name: "test-action"
    template: "test-template"
    arguments: {}`

      await fs.writeFile(path.join(jobsDir, 'test-job.yaml'), jobYaml)

      const loader = new ProjectLoader(tempDir)
      await loader.load()

      expect(loader.jobs.size).toBe(1)
      expect(loader.jobs.has('test-job')).toBe(true)
      
      const job = loader.jobs.get('test-job')!
      expect(job.name).toBe('test-job')
      expect(job.version).toBe('1')
      expect(job.description).toBe('A test job')
    })

    it('should recursively load jobs from nested directories', async () => {
      const jobsDir = path.join(tempDir, 'jobs')
      const nestedDir = path.join(jobsDir, 'nested', 'deeper')
      await fs.mkdir(nestedDir, { recursive: true })

      // Root level job
      const rootJobYaml = `name: "root-job"
version: "1"
description: "Root level job"
depends_on: []
actions: []`

      // Nested job
      const nestedJobYaml = `name: "nested-job"
version: "1"
description: "Nested job"
depends_on: []
actions: []`

      // Deep nested job
      const deepJobYaml = `name: "deep-job"
version: "1"
description: "Deep nested job"
depends_on: []
actions: []`

      await fs.writeFile(path.join(jobsDir, 'root-job.yaml'), rootJobYaml)
      await fs.writeFile(path.join(jobsDir, 'nested', 'nested-job.yml'), nestedJobYaml)
      await fs.writeFile(path.join(nestedDir, 'deep-job.yaml'), deepJobYaml)

      const loader = new ProjectLoader(tempDir)
      await loader.load()

      expect(loader.jobs.size).toBe(3)
      expect(loader.jobs.has('root-job')).toBe(true)
      expect(loader.jobs.has('nested-job')).toBe(true)
      expect(loader.jobs.has('deep-job')).toBe(true)
    })

    it('should ignore jobs in node_modules and other ignored directories', async () => {
      const jobsDir = path.join(tempDir, 'jobs')
      const nodeModulesDir = path.join(jobsDir, 'node_modules')
      const distDir = path.join(jobsDir, 'dist')
      await fs.mkdir(nodeModulesDir, { recursive: true })
      await fs.mkdir(distDir, { recursive: true })

      const validJobYaml = `name: "valid-job"
version: "1"
actions: []`

      const ignoredJobYaml = `name: "ignored-job"
version: "1"
actions: []`

      await fs.writeFile(path.join(jobsDir, 'valid-job.yaml'), validJobYaml)
      await fs.writeFile(path.join(nodeModulesDir, 'ignored-job.yaml'), ignoredJobYaml)
      await fs.writeFile(path.join(distDir, 'ignored-job2.yaml'), ignoredJobYaml)

      const loader = new ProjectLoader(tempDir)
      await loader.load()

      expect(loader.jobs.size).toBe(1)
      expect(loader.jobs.has('valid-job')).toBe(true)
      expect(loader.jobs.has('ignored-job')).toBe(false)
    })

    it('should handle malformed job files gracefully', async () => {
      const jobsDir = path.join(tempDir, 'jobs')
      await fs.mkdir(jobsDir, { recursive: true })

      const validJobYaml = `name: "valid-job"
version: "1"
actions: []`

      const invalidJobYaml = `invalid: yaml: content: [[[`

      await fs.writeFile(path.join(jobsDir, 'valid-job.yaml'), validJobYaml)
      await fs.writeFile(path.join(jobsDir, 'invalid-job.yaml'), invalidJobYaml)

      const loader = new ProjectLoader(tempDir)
      await loader.load()

      // Should load the valid job and skip the invalid one
      expect(loader.jobs.size).toBe(1)
      expect(loader.jobs.has('valid-job')).toBe(true)
    })
  })

  describe('template loading', () => {
    it('should load templates from the root templates directory', async () => {
      const templatesDir = path.join(tempDir, 'templates')
      await fs.mkdir(templatesDir, { recursive: true })

      const templateYaml = `name: "test-template"
description: "A test template"
actions:
  - name: "test-action"
    arguments: {}`

      await fs.writeFile(path.join(templatesDir, 'test-template.yaml'), templateYaml)

      const loader = new ProjectLoader(tempDir)
      await loader.load()

      expect(loader.templates.size).toBeGreaterThan(0) // Includes std templates
      expect(loader.templates.has('test-template')).toBe(true)
      
      const template = loader.templates.get('test-template')!
      expect(template.name).toBe('test-template')
      expect(template.description).toBe('A test template')
    })

    it('should recursively load templates from nested directories', async () => {
      const templatesDir = path.join(tempDir, 'templates')
      const nestedDir = path.join(templatesDir, 'nested')
      await fs.mkdir(nestedDir, { recursive: true })

      const rootTemplateYaml = `name: "root-template"
actions: []`

      const nestedTemplateYaml = `name: "nested-template"
actions: []`

      await fs.writeFile(path.join(templatesDir, 'root-template.yaml'), rootTemplateYaml)
      await fs.writeFile(path.join(nestedDir, 'nested-template.yml'), nestedTemplateYaml)

      const loader = new ProjectLoader(tempDir)
      await loader.load()

      expect(loader.templates.has('root-template')).toBe(true)
      expect(loader.templates.has('nested-template')).toBe(true)
    })
  })

  describe('artifact loading', () => {
    it('should load artifacts from nested directories', async () => {
      const artifactsDir = path.join(tempDir, 'artifacts', 'contracts')
      await fs.mkdir(artifactsDir, { recursive: true })

      const artifactJson = {
        contractName: "TestContract",
        abi: [],
        bytecode: "0x608060405234801561001057600080fd5b50",
        deployedBytecode: "0x608060405234801561001057600080fd5b50"
      }

      await fs.writeFile(path.join(artifactsDir, 'TestContract.json'), JSON.stringify(artifactJson))

      const loader = new ProjectLoader(tempDir)
      await loader.load()

      expect(loader.artifactRegistry.lookup('TestContract')).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle missing jobs directory gracefully', async () => {
      const loader = new ProjectLoader(tempDir)
      await loader.load()

      expect(loader.jobs.size).toBe(0)
    })

    it('should handle missing templates directory gracefully', async () => {
      const loader = new ProjectLoader(tempDir, { loadStdTemplates: false })
      await loader.load()

      expect(loader.templates.size).toBe(0)
    })

    it('should load standard templates by default', async () => {
      const loader = new ProjectLoader(tempDir)
      await loader.load()

      // Standard templates should be loaded
      expect(loader.templates.size).toBeGreaterThan(0)
    })

    it('should skip standard templates when disabled', async () => {
      const loader = new ProjectLoader(tempDir, { loadStdTemplates: false })
      await loader.load()

      expect(loader.templates.size).toBe(0)
    })
  })

  describe('real project structure', () => {
    it('should load the examples project structure', async () => {
      const examplesRoot = path.resolve(__dirname, '../../../../examples')
      const loader = new ProjectLoader(examplesRoot)
      await loader.load()

      // Should load some jobs and templates from examples
      expect(loader.jobs.size).toBeGreaterThan(0)
      expect(loader.templates.size).toBeGreaterThan(0)
      
      // Check for known jobs from examples
      expect(loader.jobs.has('sequence-v1')).toBe(true)
      expect(loader.jobs.has('guards-v1')).toBe(true)
    })

    it('should load the examples2 project structure with nested jobs', async () => {
      const examples2Root = path.resolve(__dirname, '../../../../examples2')
      const loader = new ProjectLoader(examples2Root)
      await loader.load()

      // Should load the nested job
      expect(loader.jobs.size).toBeGreaterThan(0)
      expect(loader.jobs.has('test-contract-deployment')).toBe(true)
    })
  })
}) 