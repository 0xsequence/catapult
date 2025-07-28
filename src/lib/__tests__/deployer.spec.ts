import * as fs from 'fs/promises'
import * as path from 'path'
import chalk from 'chalk'
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
      networks: [mockNetwork1, mockNetwork2]
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
      artifactRegistry: {} as any
    } as any

    mockGraph = {
      getExecutionOrder: jest.fn().mockReturnValue(['job1', 'job2', 'job3']),
      getDependencies: jest.fn().mockReturnValue(new Set())
    } as any

    mockEngine = {
      executeJob: jest.fn()
    } as any

    mockContext = {
      getOutputs: jest.fn().mockReturnValue(new Map<string, any>([
        ['action1.hash', '0xhash1'],
        ['action1.receipt', { status: 1 }]
      ]))
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
      expect(MockProjectLoader).toHaveBeenCalledWith('/test/project')
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

      it('should create correct output files', async () => {
        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Verify output directory creation
        expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output', { recursive: true })

        // Verify output files
        expect(mockFs.writeFile).toHaveBeenCalledTimes(3)
        
        // Check job1 output file
        const job1OutputCall = mockFs.writeFile.mock.calls.find(call => 
          call[0] === '/test/project/output/job1.json'
        )
        expect(job1OutputCall).toBeDefined()
        
        const job1Content = JSON.parse(job1OutputCall![1] as string)
        expect(job1Content).toMatchObject({
          jobName: 'job1',
          jobVersion: '1.0.0',
          lastRun: expect.any(String),
          networks: {
            '1': {
              status: 'success',
              outputs: expect.any(Object)
            },
            '137': {
              status: 'success',
              outputs: expect.any(Object)
            }
          }
        })
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

      it('should throw when job execution fails', async () => {
        mockEngine.executeJob.mockRejectedValue(new Error('Transaction failed'))

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('Transaction failed')
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

      it('should handle execution context creation failure', async () => {
        MockExecutionContext.mockImplementation(() => {
          throw new Error('Invalid private key')
        })

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('Invalid private key')
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

      it('should handle execution context without getOutputs method', async () => {
        const brokenContext = {
          // Missing getOutputs method
        } as any
        
        MockExecutionContext.mockImplementation(() => brokenContext)

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow()
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

      it('should skip output writing when no successful executions', async () => {
        // Make all executions fail but don't throw (simulate partial failure)
        mockEngine.executeJob.mockImplementation(() => {
          throw new Error('Execution failed')
        })

        const deployer = new Deployer(deployerOptions)
        
        await expect(deployer.run()).rejects.toThrow('Execution failed')
        
        // Should not write any output files since no executions succeeded
        expect(mockFs.writeFile).not.toHaveBeenCalled()
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
        
        await expect(deployer.run()).rejects.toThrow('Polygon execution failed')
      })

      it('should handle context output aggregation correctly', async () => {
        // Mock different outputs for different networks
        MockExecutionContext.mockImplementation((network) => ({
          network,
          getOutputs: jest.fn().mockReturnValue(new Map<string, any>([
            [`action.hash`, `0xhash-${network.chainId}`],
            [`action.receipt`, { status: 1, blockNumber: network.chainId * 100 }]
          ]))
        } as any))

        const deployer = new Deployer(deployerOptions)
        await deployer.run()

        // Verify outputs are correctly segregated by network
        const writeFileCalls = mockFs.writeFile.mock.calls
        const job1Output = writeFileCalls.find(call => 
          call[0] === '/test/project/output/job1.json'
        )
        
        const job1Content = JSON.parse(job1Output![1] as string)
        expect(job1Content.networks['1'].outputs['action.hash']).toBe('0xhash-1')
        expect(job1Content.networks['137'].outputs['action.hash']).toBe('0xhash-137')
      })
    })
  })
}) 