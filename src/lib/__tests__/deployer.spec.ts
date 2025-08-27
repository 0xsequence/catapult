import * as fs from 'fs/promises'
import { Deployer, DeployerOptions } from '../deployer'
import { ProjectLoader } from '../core/loader'
import { DependencyGraph } from '../core/graph'
import { ExecutionEngine } from '../core/engine'
import { ExecutionContext } from '../core/context'
import { Network, Job, Template } from '../types'

// Mock all dependencies
jest.mock('fs/promises')
jest.mock('../core/loader')
jest.mock('../core/graph')
jest.mock('../core/engine')
jest.mock('../core/context')

const mockFs = fs as jest.Mocked<typeof fs>
const MockProjectLoader = ProjectLoader as jest.MockedClass<typeof ProjectLoader>
const MockDependencyGraph = DependencyGraph as jest.MockedClass<typeof DependencyGraph>
const MockExecutionEngine = ExecutionEngine as jest.MockedClass<typeof ExecutionEngine>
const MockExecutionContext = ExecutionContext as jest.MockedClass<typeof ExecutionContext>

describe('Deployer', () => {
  let deployerOptions: DeployerOptions
  let mockNetwork1: Network
  let mockNetwork2: Network
  let mockJob1: Job
  let mockJob2: Job
  let mockJob3: Job
  let deprecatedJob: Job
  let mockTemplate1: Template
  let mockLoader: jest.Mocked<ProjectLoader>
  let mockGraph: jest.Mocked<DependencyGraph>
  let mockEngine: jest.Mocked<ExecutionEngine>
  let mockContext: jest.Mocked<ExecutionContext>

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks()
    
    // Setup mock networks
    mockNetwork1 = { name: 'mainnet', chainId: 1, rpcUrl: 'https://eth.rpc' }
    mockNetwork2 = { name: 'polygon', chainId: 137, rpcUrl: 'https://polygon.rpc' }

    // Setup mock jobs
    mockJob1 = {
      name: 'job1',
      version: '1.0.0',
      description: 'First job',
      actions: [
        { name: 'action1', template: 'template1', arguments: {} }
      ]
    }

    mockJob2 = {
      name: 'job2',
      version: '1.0.0',
      description: 'Second job',
      depends_on: ['job1'],
      actions: [
        { name: 'action2', template: 'template1', arguments: {} }
      ]
    }

    mockJob3 = {
      name: 'job3',
      version: '1.0.0',
      description: 'Third job with network filters',
      only_networks: [1], // Only mainnet
      actions: [
        { name: 'action3', template: 'template1', arguments: {} }
      ]
    }

    deprecatedJob = {
      name: 'legacy-job',
      version: '0.1.0',
      description: 'Deprecated job',
      deprecated: true,
      actions: [
        { name: 'legacy-action', template: 'template1', arguments: {} }
      ]
    }

    // Setup mock template
    mockTemplate1 = {
      name: 'template1',
      actions: [
        { type: 'send-transaction', arguments: {} }
      ]
    }

    // Basic deployer options
    deployerOptions = {
      projectRoot: '/test/project',
      privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      networks: [mockNetwork1, mockNetwork2],
      flatOutput: true
    }

    // Setup mocks
    mockLoader = {
      load: jest.fn(),
      jobs: new Map([
        ['job1', mockJob1],
        ['job2', mockJob2],
        ['job3', mockJob3]
      ]),
      templates: new Map([
        ['template1', mockTemplate1]
      ]),
      contractRepository: {} as any
    } as any

    mockGraph = {
      getExecutionOrder: jest.fn().mockReturnValue(['job1', 'job2', 'job3']),
      getDependencies: jest.fn().mockReturnValue(new Set())
    } as any

    mockEngine = {
      executeJob: jest.fn().mockResolvedValue(undefined)
    } as any

    mockContext = {
      getOutputs: jest.fn().mockReturnValue(new Map<string, any>([
        ['action1.hash', '0xhash1'],
        ['action1.receipt', { status: 1 }]
      ])),
      dispose: jest.fn().mockResolvedValue(undefined),
      setOutput: jest.fn(),
      getOutput: jest.fn()
    } as any

    MockProjectLoader.mockImplementation(() => mockLoader)
    MockDependencyGraph.mockImplementation(() => mockGraph)
    MockExecutionEngine.mockImplementation(() => mockEngine)
    MockExecutionContext.mockImplementation(() => mockContext)

    // Mock fs operations
    mockFs.mkdir.mockResolvedValue(undefined)
    mockFs.writeFile.mockResolvedValue(undefined)

    // Mock console methods to prevent test output pollution
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should create a deployer with valid options', () => {
      const deployer = new Deployer(deployerOptions)
      expect(deployer).toBeInstanceOf(Deployer)
    })

    it('should initialize ProjectLoader with correct project root', () => {
      new Deployer(deployerOptions)
      expect(MockProjectLoader).toHaveBeenCalledWith('/test/project', undefined)
    })
  })

  describe('run', () => {
    describe('happy paths', () => {
      it('should successfully run a simple deployment', async () => {
        const deployer = new Deployer(deployerOptions)
        
        await deployer.run()

        // Verify the flow
        expect(mockLoader.load).toHaveBeenCalledTimes(1)
        expect(MockDependencyGraph).toHaveBeenCalledWith(mockLoader.jobs, mockLoader.templates)
        expect(mockGraph.getExecutionOrder).toHaveBeenCalledTimes(1)
        expect(MockExecutionEngine).toHaveBeenCalledWith(mockLoader.templates, expect.any(Object))
        expect(mockEngine.executeJob).toHaveBeenCalledTimes(5) // job1&job2 on 2 networks + job3 on 1 network
        expect(MockExecutionContext).toHaveBeenCalledTimes(5)
        expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output', { recursive: true })
        expect(mockFs.writeFile).toHaveBeenCalledTimes(3) // One file per job
      })

      it('should run only specified jobs and their dependencies', async () => {
        // Mock getDependencies for this specific test
        mockGraph.getDependencies.mockImplementation((jobName: string) => {
          if (jobName === 'job2') return new Set(['job1'])
          return new Set()
        })
        
        const options: DeployerOptions = {
          ...deployerOptions,
          runJobs: ['job2'] // This should also include job1 due to dependency
        }
        
        const deployer = new Deployer(options)
        await deployer.run()

        // Should execute job1 (dependency) and job2, but not job3
        expect(mockEngine.executeJob).toHaveBeenCalledTimes(4) // 2 jobs × 2 networks
        
        // Verify it was called with the right jobs
        const executedJobs = mockEngine.executeJob.mock.calls.map(call => call[0].name)
        expect(executedJobs).toContain('job1')
        expect(executedJobs).toContain('job2')
        expect(executedJobs).not.toContain('job3')
      })

      it('should run only on specified networks', async () => {
        const options: DeployerOptions = {
          ...deployerOptions,
          runOnNetworks: [1] // Only mainnet
        }
        
        const deployer = new Deployer(options)
        await deployer.run()

        expect(mockEngine.executeJob).toHaveBeenCalledTimes(3) // 3 jobs × 1 network
        
        // Verify all calls were with mainnet
        const usedNetworks = MockExecutionContext.mock.calls.map(call => call[0])
        expect(usedNetworks).toHaveLength(3)
        usedNetworks.forEach(network => {
          expect(network.chainId).toBe(1)
        })
      })

      it('should skip jobs based on network filters', async () => {
        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // job3 has only_networks: [1], so should only run on mainnet
        const job3Calls = mockEngine.executeJob.mock.calls.filter(call => call[0].name === 'job3')
        expect(job3Calls).toHaveLength(1) // Only on mainnet
        
        // Verify it was called with mainnet (check the MockExecutionContext calls)
        const contextCallsForJob3 = MockExecutionContext.mock.calls.filter((_, index) => {
          const engineCall = mockEngine.executeJob.mock.calls[index]
          return engineCall && engineCall[0].name === 'job3'
        })
        expect(contextCallsForJob3[0][0].chainId).toBe(1)
      })

      it('should handle jobs with skip_networks filter', async () => {
        const jobWithSkipNetworks: Job = {
          ...mockJob1,
          name: 'job-skip-polygon',
          skip_networks: [137] // Skip polygon
        }
        
        mockLoader.jobs.set('job-skip-polygon', jobWithSkipNetworks)
        mockGraph.getExecutionOrder.mockReturnValue(['job-skip-polygon'])

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Should only run on mainnet (chainId 1), not polygon (chainId 137)
        expect(mockEngine.executeJob).toHaveBeenCalledTimes(1)
        const usedNetwork = MockExecutionContext.mock.calls[0][0]
        expect(usedNetwork.chainId).toBe(1)
      })

      it('should create correct output files in flat mode', async () => {
        const deployer = new Deployer({ ...deployerOptions, flatOutput: true })
        await deployer.run()

        // Verify output directory creation
        expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output', { recursive: true })

        // Verify output files (flat)
        expect(mockFs.writeFile).toHaveBeenCalledTimes(3)
        
        // Check job1 output file (flat path)
        const job1OutputCall = mockFs.writeFile.mock.calls.find(call =>
          call[0] === '/test/project/output/job1.json'
        )
        expect(job1OutputCall).toBeDefined()
        
        const job1Content = JSON.parse(job1OutputCall![1] as string)
        expect(job1Content).toMatchObject({
          jobName: 'job1',
          jobVersion: '1.0.0',
          lastRun: expect.any(String),
          networks: [
            {
              status: 'success',
              chainIds: expect.arrayContaining(['1', '137']),
              outputs: expect.any(Object)
            }
          ]
        })
      })

      it('should mirror jobs directory structure by default', async () => {
        // Attach source paths to jobs to simulate their locations
        const job1 = mockLoader.jobs.get('job1') as any
        const job2 = mockLoader.jobs.get('job2') as any
        const job3 = mockLoader.jobs.get('job3') as any
        job1._path = '/test/project/jobs/core/job1.yaml'
        job2._path = '/test/project/jobs/patches/job2.yml'
        job3._path = '/test/project/jobs/job3.yaml'

        const deployer = new Deployer({ ...deployerOptions, flatOutput: undefined })
        await deployer.run()

        // Should create nested directories
        expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output/core', { recursive: true })
        expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output/patches', { recursive: true })

        // job1.json under core
        const job1OutputCall = mockFs.writeFile.mock.calls.find(call =>
          call[0] === '/test/project/output/core/job1.json'
        )
        expect(job1OutputCall).toBeDefined()

        // job2.json under patches
        const job2OutputCall = mockFs.writeFile.mock.calls.find(call =>
          call[0] === '/test/project/output/patches/job2.json'
        )
        expect(job2OutputCall).toBeDefined()

        // job3 at root (no subdir)
        const job3OutputCall = mockFs.writeFile.mock.calls.find(call =>
          call[0] === '/test/project/output/job3.json'
        )
        expect(job3OutputCall).toBeDefined()
      })

      it('should handle empty project gracefully', async () => {
        mockLoader.jobs.clear()
        mockLoader.templates.clear()
        mockGraph.getExecutionOrder.mockReturnValue([])

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        expect(mockEngine.executeJob).not.toHaveBeenCalled()
        expect(mockFs.writeFile).not.toHaveBeenCalled()
      })

      it('should filter outputs based on action output flags', async () => {
        // Create a job with mixed output flags
        const jobWithOutputFlags: Job = {
          name: 'job-with-output-flags',
          version: '1.0.0',
          description: 'Job with output filtering',
          actions: [
            { name: 'deploy-action', template: 'template1', arguments: {}, output: true },
            { name: 'verify-action', template: 'template1', arguments: {}, output: false },
            { name: 'other-action', template: 'template1', arguments: {} } // no output flag
          ]
        }
        
        mockLoader.jobs.clear()
        mockLoader.jobs.set('job-with-output-flags', jobWithOutputFlags)
        mockGraph.getExecutionOrder.mockReturnValue(['job-with-output-flags'])
        
        // Mock context to return outputs from all actions
        mockContext.getOutputs.mockReturnValue(new Map<string, any>([
          ['deploy-action.address', '0xdeployaddress'],
          ['deploy-action.hash', '0xdeployhash'],
          ['verify-action.guid', 'verification-guid'],
          ['other-action.result', 'some-result']
        ]))

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Verify output file was written
        expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
        
        const outputCall = mockFs.writeFile.mock.calls[0]
        expect(outputCall[0]).toBe('/test/project/output/job-with-output-flags.json')
        
        const outputContent = JSON.parse(outputCall[1] as string)
        expect(outputContent.networks).toHaveLength(1)
        expect(outputContent.networks[0].status).toBe('success')
        
        // Should only include outputs from deploy-action (output: true)
        // Should NOT include verify-action (output: false) or other-action (no flag)
        expect(outputContent.networks[0].outputs).toEqual({
          'deploy-action.address': '0xdeployaddress',
          'deploy-action.hash': '0xdeployhash'
        })
      })

      it('should include all outputs when no actions have output: true (backward compatibility)', async () => {
        // Create a job where no actions explicitly set output: true
        const jobWithoutOutputFlags: Job = {
          name: 'job-without-output-flags',
          version: '1.0.0',
          description: 'Job without output flags',
          actions: [
            { name: 'action1', template: 'template1', arguments: {} },
            { name: 'action2', template: 'template1', arguments: {}, output: false }
          ]
        }
        
        mockLoader.jobs.clear()
        mockLoader.jobs.set('job-without-output-flags', jobWithoutOutputFlags)
        mockGraph.getExecutionOrder.mockReturnValue(['job-without-output-flags'])
        
        // Mock context to return outputs from all actions
        mockContext.getOutputs.mockReturnValue(new Map<string, any>([
          ['action1.result', 'result1'],
          ['action2.result', 'result2']
        ]))

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Verify output file was written
        expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
        
        const outputCall = mockFs.writeFile.mock.calls[0]
        const outputContent = JSON.parse(outputCall[1] as string)
        
        // Should include all outputs (backward compatibility)
        expect(outputContent.networks[0].outputs).toEqual({
          'action1.result': 'result1',
          'action2.result': 'result2'
        })
      })

      it('should filter outputs correctly when multiple actions have output: true', async () => {
        // Create a job with multiple actions marked for output
        const jobWithMultipleOutputs: Job = {
          name: 'job-multiple-outputs',
          version: '1.0.0',
          description: 'Job with multiple output actions',
          actions: [
            { name: 'deploy1', template: 'template1', arguments: {}, output: true },
            { name: 'deploy2', template: 'template1', arguments: {}, output: true },
            { name: 'verify1', template: 'template1', arguments: {}, output: false },
            { name: 'verify2', template: 'template1', arguments: {}, output: false }
          ]
        }
        
        mockLoader.jobs.clear()
        mockLoader.jobs.set('job-multiple-outputs', jobWithMultipleOutputs)
        mockGraph.getExecutionOrder.mockReturnValue(['job-multiple-outputs'])
        
        // Mock context to return outputs from all actions
        mockContext.getOutputs.mockReturnValue(new Map<string, any>([
          ['deploy1.address', '0xdeploy1'],
          ['deploy2.address', '0xdeploy2'],
          ['verify1.guid', 'verify1-guid'],
          ['verify2.guid', 'verify2-guid']
        ]))

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Verify output file was written
        const outputCall = mockFs.writeFile.mock.calls[0]
        const outputContent = JSON.parse(outputCall[1] as string)
        
        // Should include outputs from both deploy actions, but not verify actions
        expect(outputContent.networks[0].outputs).toEqual({
          'deploy1.address': '0xdeploy1',
          'deploy2.address': '0xdeploy2'
        })
      })
    })

    describe('error handling', () => {
      it('should throw when project loading fails', async () => {
        mockLoader.load.mockRejectedValue(new Error('Failed to load project'))

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('Failed to load project')
        // Note: Error handling is now done via events, not console.error directly
      })

      it('should throw when dependency graph creation fails', async () => {
        MockDependencyGraph.mockImplementation(() => {
          throw new Error('Circular dependency detected')
        })

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('Circular dependency detected')
      })

            it('should capture job execution failures and then throw', async () => {
        mockEngine.executeJob.mockRejectedValue(new Error('Transaction failed'))
        
        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution')
        
        // Should still write output files with error entries before throwing
        expect(mockFs.writeFile).toHaveBeenCalled()
        
        // Check that error entries are recorded
        const writeFileCalls = mockFs.writeFile.mock.calls
        const outputFile = writeFileCalls[0]
        const outputContent = JSON.parse(outputFile[1] as string)
        
        // Should have error entries for failed executions
        const errorEntries = outputContent.networks.filter((entry: any) => entry.status === 'error')
        expect(errorEntries.length).toBeGreaterThan(0)
        expect(errorEntries[0].error).toBe('Transaction failed')
      })

      it('should throw when output directory creation fails', async () => {
        mockFs.mkdir.mockRejectedValue(new Error('Permission denied'))

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('Permission denied')
      })

      it('should throw when output file writing fails', async () => {
        mockFs.writeFile.mockRejectedValue(new Error('Disk full'))

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('Disk full')
      })

      it('should handle execution context creation failure and then throw', async () => {
        MockExecutionContext.mockImplementation(() => {
          throw new Error('Invalid private key')
        })

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution')
        
        // Should record context creation failures as error entries before throwing
        const writeFileCalls = mockFs.writeFile.mock.calls
        const outputFile = writeFileCalls[0]
        const outputContent = JSON.parse(outputFile[1] as string)
        
        const errorEntries = outputContent.networks.filter((entry: any) => entry.status === 'error')
        expect(errorEntries.length).toBeGreaterThan(0)
        expect(errorEntries[0].error).toBe('Invalid private key')
      })
    })

    describe('edge cases and weird scenarios', () => {
      it('should handle job with only_networks that includes non-existent network', async () => {
        const weirdJob: Job = {
          ...mockJob1,
          name: 'weird-job',
          only_networks: [999] // Non-existent network
        }
        
        mockLoader.jobs.clear()
        mockLoader.jobs.set('weird-job', weirdJob)
        mockGraph.getExecutionOrder.mockReturnValue(['weird-job'])

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Should not execute on any network
        expect(mockEngine.executeJob).not.toHaveBeenCalled()
      })

      it('should handle job with skip_networks that includes all networks', async () => {
        const weirdJob: Job = {
          ...mockJob1,
          name: 'weird-job',
          skip_networks: [1, 137] // Skip all available networks
        }
        
        mockLoader.jobs.clear()
        mockLoader.jobs.set('weird-job', weirdJob)
        mockGraph.getExecutionOrder.mockReturnValue(['weird-job'])

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Should not execute on any network
        expect(mockEngine.executeJob).not.toHaveBeenCalled()
      })

      it('should handle runOnNetworks with non-existent chain IDs', async () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
        
        const options: DeployerOptions = {
          ...deployerOptions,
          runOnNetworks: [1, 999, 888] // 999 and 888 don't exist
        }
        
        const deployer = new Deployer(options)
        await deployer.run()

        // Note: Warnings are now emitted as events, not console.warn directly
        // The CLI adapter converts events to console output

        // Should only execute on the existing network (chainId 1)
        expect(mockEngine.executeJob).toHaveBeenCalledTimes(3) // 3 jobs × 1 network
      })

      it('should handle runJobs with non-existent job names', async () => {
        const options: DeployerOptions = {
          ...deployerOptions,
          runJobs: ['non-existent-job']
        }
        
        const deployer = new Deployer(options)
        
        await expect(deployer.run()).rejects.toThrow(
          'Specified job "non-existent-job" not found in project.'
        )
      })

      it('should handle execution context without getOutputs method and then throw', async () => {
        const brokenContext = {
          // Missing getOutputs method
        } as any
        
        MockExecutionContext.mockImplementation(() => brokenContext)

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution')
        
        // Should record the missing method error before throwing
        const writeFileCalls = mockFs.writeFile.mock.calls
        const outputFile = writeFileCalls[0]
        const outputContent = JSON.parse(outputFile[1] as string)
        
        const errorEntries = outputContent.networks.filter((entry: any) => entry.status === 'error')
        expect(errorEntries.length).toBeGreaterThan(0)
      })

      it('should handle empty networks array', async () => {
        const options: DeployerOptions = {
          ...deployerOptions,
          networks: []
        }
        
        const deployer = new Deployer(options)
        await deployer.run()

        // Should not execute anything
        expect(mockEngine.executeJob).not.toHaveBeenCalled()
        expect(mockFs.writeFile).not.toHaveBeenCalled()
      })

      it('should handle empty runJobs array', async () => {
        const options: DeployerOptions = {
          ...deployerOptions,
          runJobs: []
        }
        
        const deployer = new Deployer(options)
        await deployer.run()

        // Should run all jobs
        expect(mockEngine.executeJob).toHaveBeenCalledTimes(5) // job1&job2 on 2 networks + job3 on 1 network
      })

      it('should handle empty runOnNetworks array', async () => {
        const options: DeployerOptions = {
          ...deployerOptions,
          runOnNetworks: []
        }
        
        const deployer = new Deployer(options)
        await deployer.run()

        // Should run on all networks
        expect(mockEngine.executeJob).toHaveBeenCalledTimes(5) // job1&job2 on 2 networks + job3 on 1 network
      })

      it('should handle job with both only_networks and skip_networks', async () => {
        const conflictedJob: Job = {
          ...mockJob1,
          name: 'conflicted-job',
          only_networks: [1, 137],
          skip_networks: [137]
        }
        
        mockLoader.jobs.clear()
        mockLoader.jobs.set('conflicted-job', conflictedJob)
        mockGraph.getExecutionOrder.mockReturnValue(['conflicted-job'])

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // only_networks takes precedence, so should run on [1, 137]
        // skip_networks is ignored when only_networks is present
        expect(mockEngine.executeJob).toHaveBeenCalledTimes(2)
        const usedNetworks = MockExecutionContext.mock.calls.map(call => call[0].chainId)
        expect(usedNetworks).toEqual(expect.arrayContaining([1, 137]))
      })

      it('should write output files even when all executions fail and then throw', async () => {
        // Make all executions fail
        mockEngine.executeJob.mockImplementation(() => {
          throw new Error('Execution failed')
        })

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution')
        
        // Should write output files with error entries before throwing
        expect(mockFs.writeFile).toHaveBeenCalled()
        
        const writeFileCalls = mockFs.writeFile.mock.calls
        const outputFile = writeFileCalls[0]
        const outputContent = JSON.parse(outputFile[1] as string)
        
        // All entries should be error entries
        const errorEntries = outputContent.networks.filter((entry: any) => entry.status === 'error')
        expect(errorEntries.length).toBeGreaterThan(0)
        
        // No success entries
        const successEntries = outputContent.networks.filter((entry: any) => entry.status === 'success')
        expect(successEntries.length).toBe(0)
      })

      it('should handle very long execution order', async () => {
        // Create 100 jobs to test performance/memory
        const manyJobs = Array.from({ length: 100 }, (_, i) => `job${i}`)
        mockGraph.getExecutionOrder.mockReturnValue(manyJobs)
        
        // Mock loader to have all these jobs
        for (let i = 0; i < 100; i++) {
          mockLoader.jobs.set(`job${i}`, {
            ...mockJob1,
            name: `job${i}`
          })
        }

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        expect(mockEngine.executeJob).toHaveBeenCalledTimes(200) // 100 jobs × 2 networks
        expect(mockFs.writeFile).toHaveBeenCalledTimes(100) // One file per job
      })
    })

    describe('private method testing', () => {
      let deployer: Deployer

      beforeEach(() => {
        deployer = new Deployer(deployerOptions)
      })

      describe('getJobExecutionPlan', () => {
        it('should return full order when no runJobs specified', () => {
          const fullOrder = ['job1', 'job2', 'job3']
          const plan = (deployer as any).getJobExecutionPlan(fullOrder)
          expect(plan).toEqual(fullOrder)
        })

        it('should filter and include dependencies', async () => {
          const options: DeployerOptions = {
            ...deployerOptions,
            runJobs: ['job2']
          }
          const deployer = new Deployer(options)
          
          // Initialize the deployer's graph by calling load
          await mockLoader.load()
          ;(deployer as any).graph = mockGraph
          
          // Mock getDependencies to return job1 as dependency of job2
          mockGraph.getDependencies.mockReturnValueOnce(new Set(['job1']))
          
          const fullOrder = ['job1', 'job2', 'job3']
          const plan = (deployer as any).getJobExecutionPlan(fullOrder)
          expect(plan).toEqual(['job1', 'job2'])
        })

        it('should include deprecated dependencies when no runJobs specified', () => {
          // Add deprecated job and make job2 depend on it transitively
          ;(mockLoader.jobs as Map<string, Job>).set('legacy-job', deprecatedJob)

          // full order includes all
          const fullOrder = ['legacy-job', 'job1', 'job2', 'job3']

          // Mock dependency graph: job2 depends on job1 and legacy-job
          mockGraph.getDependencies.mockImplementation((jobName: string) => {
            if (jobName === 'job2') return new Set(['job1', 'legacy-job'])
            return new Set()
          })
          ;(deployer as any).graph = mockGraph
          const plan = (deployer as any).getJobExecutionPlan(fullOrder)
          // Expect legacy-job to be included because it is a dependency of non-deprecated job2
          expect(plan).toEqual(['legacy-job', 'job1', 'job2', 'job3'])
        })

        it('should keep deprecated dependencies when specific jobs are requested', async () => {
          // Add deprecated job and dependency relation
          ;(mockLoader.jobs as Map<string, Job>).set('legacy-job', deprecatedJob)
          const options: DeployerOptions = {
            ...deployerOptions,
            runJobs: ['job2']
          }
          const depDeployer = new Deployer(options)
          ;(depDeployer as any).graph = mockGraph

          mockGraph.getDependencies.mockImplementation((jobName: string) => {
            if (jobName === 'job2') return new Set(['job1', 'legacy-job'])
            return new Set()
          })

          const fullOrder = ['legacy-job', 'job1', 'job2', 'job3']
          const plan = (depDeployer as any).getJobExecutionPlan(fullOrder)
          expect(plan).toEqual(['legacy-job', 'job1', 'job2'])
        })

        it('should expand wildcard patterns in runJobs and preserve execution order', async () => {
          ;(mockLoader.jobs as Map<string, Job>).set('job10', { ...mockJob1, name: 'job10' })
          ;(mockLoader.jobs as Map<string, Job>).set('another', { ...mockJob1, name: 'another' })

          const fullOrder = ['another', 'job1', 'job2', 'job3', 'job10']
          mockGraph.getExecutionOrder.mockReturnValue(fullOrder)

          const options: DeployerOptions = {
            ...deployerOptions,
            runJobs: ['job*']
          }
          const dep = new Deployer(options)
          ;(dep as any).loader = mockLoader
          ;(dep as any).graph = mockGraph

          const plan = (dep as any).getJobExecutionPlan(fullOrder)
          expect(plan).toEqual(['job1', 'job2', 'job3', 'job10'])
        })

        it('should support mixed exact names and patterns', async () => {
          const fullOrder = ['job1', 'job2', 'job3']
          mockGraph.getExecutionOrder.mockReturnValue(fullOrder)

          const options: DeployerOptions = {
            ...deployerOptions,
            runJobs: ['job1', 'job?']
          }
          const dep = new Deployer(options)
          ;(dep as any).loader = mockLoader
          ;(dep as any).graph = mockGraph

          const plan = (dep as any).getJobExecutionPlan(fullOrder)
          expect(plan).toEqual(['job1', 'job2', 'job3'])
        })

        it('should throw when a pattern matches no jobs', async () => {
          const fullOrder = ['job1', 'job2', 'job3']
          mockGraph.getExecutionOrder.mockReturnValue(fullOrder)

          const options: DeployerOptions = {
            ...deployerOptions,
            runJobs: ['does-not-exist*']
          }
          const dep = new Deployer(options)
          ;(dep as any).loader = mockLoader
          ;(dep as any).graph = mockGraph

          expect(() => (dep as any).getJobExecutionPlan(fullOrder)).toThrow(
            'Job pattern "does-not-exist*" did not match any jobs in project.'
          )
        })

        it('should match names containing slashes with patterns', async () => {
          const jA: Job = { ...mockJob1, name: 'sequence_v3/beta_4' }
          const jB: Job = { ...mockJob1, name: 'sequence_v3/rc_1' }
          ;(mockLoader.jobs as Map<string, Job>).set(jA.name, jA)
          ;(mockLoader.jobs as Map<string, Job>).set(jB.name, jB)

          const fullOrder = ['job1', jA.name, jB.name, 'job2']
          mockGraph.getExecutionOrder.mockReturnValue(fullOrder)

          const options: DeployerOptions = {
            ...deployerOptions,
            runJobs: ['sequence_v3/*']
          }
          const dep = new Deployer(options)
          ;(dep as any).loader = mockLoader
          ;(dep as any).graph = mockGraph

          const plan = (dep as any).getJobExecutionPlan(fullOrder)
          expect(plan).toEqual(['sequence_v3/beta_4', 'sequence_v3/rc_1'])
        })
      })

      describe('getTargetNetworks', () => {
        it('should return all networks when no runOnNetworks specified', () => {
          const networks = (deployer as any).getTargetNetworks()
          expect(networks).toEqual([mockNetwork1, mockNetwork2])
        })

        it('should filter networks by chain ID', () => {
          const options: DeployerOptions = {
            ...deployerOptions,
            runOnNetworks: [1]
          }
          const deployer = new Deployer(options)
          
          const networks = (deployer as any).getTargetNetworks()
          expect(networks).toEqual([mockNetwork1])
        })
      })

      describe('shouldSkipJobOnNetwork', () => {
        it('should return false for job with no network filters', () => {
          const result = (deployer as any).shouldSkipJobOnNetwork(mockJob1, mockNetwork1)
          expect(result).toBe(false)
        })

        it('should return true when network not in only_networks', () => {
          const result = (deployer as any).shouldSkipJobOnNetwork(mockJob3, mockNetwork2)
          expect(result).toBe(true)
        })

        it('should return false when network is in only_networks', () => {
          const result = (deployer as any).shouldSkipJobOnNetwork(mockJob3, mockNetwork1)
          expect(result).toBe(false)
        })

        it('should return true when network is in skip_networks', () => {
          const jobWithSkip = {
            ...mockJob1,
            skip_networks: [1]
          }
          const result = (deployer as any).shouldSkipJobOnNetwork(jobWithSkip, mockNetwork1)
          expect(result).toBe(true)
        })
      })
    })

    describe('integration-like scenarios', () => {
      it('should handle complex dependency chain with network filtering', async () => {
        // Create a complex scenario:
        // job1 -> job2 -> job3
        // job3 only runs on mainnet
        // job4 skips polygon
        const job4: Job = {
          name: 'job4',
          version: '1.0.0',
          depends_on: ['job3'],
          skip_networks: [137],
          actions: [{ name: 'action4', template: 'template1', arguments: {} }]
        }

        mockLoader.jobs.set('job4', job4)
        mockGraph.getExecutionOrder.mockReturnValue(['job1', 'job2', 'job3', 'job4'])
        
        // Mock dependencies
        mockGraph.getDependencies
          .mockReturnValueOnce(new Set()) // job1 has no deps
          .mockReturnValueOnce(new Set(['job1'])) // job2 depends on job1
          .mockReturnValueOnce(new Set(['job1', 'job2'])) // job3 depends on job1, job2
          .mockReturnValueOnce(new Set(['job1', 'job2', 'job3'])) // job4 depends on all

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // job1, job2: run on both networks (2 + 2 = 4)
        // job3: only mainnet (1)
        // job4: skip polygon, so only mainnet (1)
        // Total: 6 executions
        expect(mockEngine.executeJob).toHaveBeenCalledTimes(6)

        // Verify network distribution by checking ExecutionContext constructor calls
        const contextCalls = MockExecutionContext.mock.calls
        const mainnetCalls = contextCalls.filter(call => call[0].chainId === 1)
        const polygonCalls = contextCalls.filter(call => call[0].chainId === 137)
        
        expect(mainnetCalls).toHaveLength(4) // All jobs run on mainnet
        expect(polygonCalls).toHaveLength(2) // Only job1 and job2 run on polygon
      })

      it('should handle partial failure scenario', async () => {
        // Make job2 fail on polygon only
        let callCount = 0
        mockEngine.executeJob.mockImplementation((job, context) => {
          const currentCall = MockExecutionContext.mock.calls[callCount]
          const network = currentCall ? currentCall[0] : null
          callCount++
          
          if (job.name === 'job2' && network && network.chainId === 137) {
            throw new Error('Polygon execution failed')
          }
          return Promise.resolve()
        })

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution')
        
        // Should capture the partial failure in output files before throwing
        const writeFileCalls = mockFs.writeFile.mock.calls
        const job2Output = writeFileCalls.find(call => 
          String(call[0]).includes('job2.json')
        )
        
        if (job2Output) {
          const job2Content = JSON.parse(job2Output[1] as string)
          const errorEntries = job2Content.networks.filter((entry: any) => entry.status === 'error')
          expect(errorEntries.some((entry: any) => 
            entry.chainId === '137' && entry.error === 'Polygon execution failed'
          )).toBe(true)
        }
      })

      it('should handle context output aggregation correctly', async () => {
        // Mock different outputs for different networks
        MockExecutionContext.mockImplementation((network) => ({
          network,
          getOutputs: jest.fn().mockReturnValue(new Map<string, any>([
            [`action.hash`, `0xhash-${network.chainId}`],
            [`action.receipt`, { status: 1, blockNumber: network.chainId * 100 }]
          ])),
          dispose: jest.fn().mockResolvedValue(undefined),
          setOutput: jest.fn(),
          getOutput: jest.fn()
        } as any))

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Verify outputs are correctly segregated by network since they have different outputs
        const writeFileCalls = mockFs.writeFile.mock.calls
        const job1Output = writeFileCalls.find(call => 
          call[0] === '/test/project/output/job1.json'
        )
        
        const job1Content = JSON.parse(job1Output![1] as string)
        // Since outputs differ by network, they should be in separate entries
        expect(job1Content.networks).toHaveLength(2)
        
        // Find entries for each network
        const network1Entry = job1Content.networks.find((entry: any) => 
          entry.chainIds && entry.chainIds.includes('1')
        )
        const network137Entry = job1Content.networks.find((entry: any) => 
          entry.chainIds && entry.chainIds.includes('137')
        )
        
        expect(network1Entry.outputs['action.hash']).toBe('0xhash-1')
        expect(network137Entry.outputs['action.hash']).toBe('0xhash-137')
      })

      it('should group networks with identical outputs together', async () => {
        // Mock identical outputs for different networks
        MockExecutionContext.mockImplementation(() => ({
          getOutputs: jest.fn().mockReturnValue(new Map<string, any>([
            [`contract.address`, `0x1234567890123456789012345678901234567890`],
            [`contract.txHash`, `0xabcdef1234567890abcdef1234567890abcdef12`]
          ])),
          dispose: jest.fn().mockResolvedValue(undefined),
          setOutput: jest.fn(),
          getOutput: jest.fn()
        } as any))

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Verify identical outputs are grouped together
        const writeFileCalls = mockFs.writeFile.mock.calls
        const job1Output = writeFileCalls.find(call => 
          call[0] === '/test/project/output/job1.json'
        )
        
        const job1Content = JSON.parse(job1Output![1] as string)
        // Since outputs are identical, they should be grouped into one entry
        expect(job1Content.networks).toHaveLength(1)
        expect(job1Content.networks[0].status).toBe('success')
        expect(job1Content.networks[0].chainIds).toEqual(['1', '137'])
        expect(job1Content.networks[0].outputs['contract.address']).toBe('0x1234567890123456789012345678901234567890')
      })

      it('should handle partial failure scenario with proper grouping', async () => {
        // Make job1 fail on polygon only
        let callCount = 0
        mockEngine.executeJob.mockImplementation((job, context) => {
          const currentCall = MockExecutionContext.mock.calls[callCount]
          const network = currentCall ? currentCall[0] : null
          callCount++
          
          if (job.name === 'job1' && network && network.chainId === 137) {
            throw new Error('Polygon execution failed')
          }
          return Promise.resolve()
        })

        // Mock successful outputs for mainnet
        MockExecutionContext.mockImplementation((network) => ({
          network,
          getOutputs: jest.fn().mockReturnValue(new Map<string, any>([
            [`contract.address`, `0x1234567890123456789012345678901234567890`]
          ])),
          dispose: jest.fn().mockResolvedValue(undefined),
          setOutput: jest.fn(),
          getOutput: jest.fn()
        } as any))

        const deployer = new Deployer(deployerOptions)
        await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution')

        // Verify outputs show both success and error states before throwing
        const writeFileCalls = mockFs.writeFile.mock.calls
        const job1Output = writeFileCalls.find(call => 
          call[0] === '/test/project/output/job1.json'
        )
        
        const job1Content = JSON.parse(job1Output![1] as string)
        expect(job1Content.networks).toHaveLength(2) // One success entry, one error entry
        
        // Find success and error entries
        const successEntry = job1Content.networks.find((entry: any) => entry.status === 'success')
        const errorEntry = job1Content.networks.find((entry: any) => entry.status === 'error')
        
        expect(successEntry).toBeDefined()
        expect(successEntry.chainIds).toEqual(['1'])
        expect(successEntry.outputs['contract.address']).toBe('0x1234567890123456789012345678901234567890')
        
        expect(errorEntry).toBeDefined()
        expect(errorEntry.chainId).toBe('137')
        expect(errorEntry.error).toBe('Polygon execution failed')
      })
    })
  })

  describe('fail-early functionality', () => {
    beforeEach(() => {
      // Clear mock call counts for this test suite
      mockEngine.executeJob.mockClear()
    })

    it('should stop execution immediately when failEarly is true', async () => {
      const options: DeployerOptions = {
        ...deployerOptions,
        runJobs: ['job1'], // Only run job1 to have predictable call count
        failEarly: true
      }

      // Make the first execution fail
      mockEngine.executeJob.mockRejectedValueOnce(new Error('First job failed'))

      const deployer = new Deployer(options)
      
      await expect(deployer.run()).rejects.toThrow('First job failed')
      
      // Should only attempt the first execution, not continue to other networks/jobs
      expect(mockEngine.executeJob).toHaveBeenCalledTimes(1)
    })

    it('should continue through all jobs/networks when failEarly is false', async () => {
      const options: DeployerOptions = {
        ...deployerOptions,
        runJobs: ['job1'], // Only run job1 to have predictable call count
        failEarly: false // explicit false
      }

      // Make the first execution fail but others succeed
      mockEngine.executeJob.mockRejectedValueOnce(new Error('First job failed'))
      mockEngine.executeJob.mockResolvedValue(undefined)

      const deployer = new Deployer(options)
      
      await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution')
      
      // Should attempt all executions (2 networks * 1 job = 2 calls)
      expect(mockEngine.executeJob).toHaveBeenCalledTimes(2)
    })

    it('should default to failEarly: false when option is not provided', async () => {
      const options: DeployerOptions = {
        ...deployerOptions,
        runJobs: ['job1'] // Only run job1 to have predictable call count
        // failEarly not specified, should default to false
      }

      // Make the first execution fail but others succeed
      mockEngine.executeJob.mockRejectedValueOnce(new Error('First job failed'))
      mockEngine.executeJob.mockResolvedValue(undefined)

      const deployer = new Deployer(options)
      
      await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution')
      
      // Should attempt all executions
      expect(mockEngine.executeJob).toHaveBeenCalledTimes(2)
    })

    it('should not throw when all jobs succeed, regardless of failEarly setting', async () => {
      const options: DeployerOptions = {
        ...deployerOptions,
        runJobs: ['job1'], // Only run job1 to have predictable call count
        failEarly: true
      }

      // All executions succeed
      mockEngine.executeJob.mockResolvedValue(undefined)

      const deployer = new Deployer(options)
      
      await expect(deployer.run()).resolves.not.toThrow()
      
      // Should complete all executions
      expect(mockEngine.executeJob).toHaveBeenCalledTimes(2)
    })
  })
}) 