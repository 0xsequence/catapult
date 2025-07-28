import { Deployer, DeployerOptions } from '../deployer'
import { DeploymentEventEmitter } from '../events'
import { Network } from '../types'

// Mock the ProjectLoader to avoid file system dependencies in tests
jest.mock('../core/loader', () => {
  return {
    ProjectLoader: jest.fn().mockImplementation(() => ({
      load: jest.fn().mockResolvedValue(undefined),
      jobs: new Map([
        ['test-job', {
          name: 'test-job',
          version: '1.0.0',
          actions: [],
          depends_on: []
        }]
      ]),
      templates: new Map(),
      artifactRegistry: {
        getByName: jest.fn(),
        getByHash: jest.fn()
      }
    }))
  }
})

// Mock the DependencyGraph
jest.mock('../core/graph', () => {
  return {
    DependencyGraph: jest.fn().mockImplementation(() => ({
      getExecutionOrder: jest.fn().mockReturnValue(['test-job']),
      getDependencies: jest.fn().mockReturnValue(new Set())
    }))
  }
})

// Mock the ExecutionEngine
jest.mock('../core/engine', () => {
  return {
    ExecutionEngine: jest.fn().mockImplementation(() => ({
      executeJob: jest.fn().mockResolvedValue(undefined)
    }))
  }
})

// Mock the ExecutionContext to avoid ethers validation
jest.mock('../core/context', () => {
  return {
    ExecutionContext: jest.fn().mockImplementation(() => ({
      getNetwork: jest.fn().mockReturnValue({
        name: 'localhost',
        chainId: 1337,
        rpcUrl: 'http://localhost:8545'
      }),
      setOutput: jest.fn(),
      getOutput: jest.fn(),
      getOutputs: jest.fn().mockReturnValue(new Map())
    }))
  }
})

// Mock fs operations
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined)
}))

describe('Deployer Event Integration', () => {
  let deployer: Deployer
  let eventEmitter: DeploymentEventEmitter
  let emittedEvents: any[]

  const mockOptions: DeployerOptions = {
    projectRoot: '/test/project',
    privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
    networks: [
      {
        name: 'localhost',
        chainId: 1337,
        rpcUrl: 'http://localhost:8545'
      } as Network
    ]
  }

  beforeEach(() => {
    emittedEvents = []
    eventEmitter = new DeploymentEventEmitter()
    
    // Capture all emitted events
    eventEmitter.onAnyEvent((event) => {
      emittedEvents.push(event)
    })

    deployer = new Deployer({
      ...mockOptions,
      eventEmitter
    })
  })

  describe('Deployment Lifecycle Events', () => {
    it('should emit deployment_started event when run begins', async () => {
      await expect(deployer.run()).resolves.not.toThrow()

      const startEvent = emittedEvents.find(e => e.type === 'deployment_started')
      expect(startEvent).toBeDefined()
      expect(startEvent.data.projectRoot).toBe('/test/project')
      expect(startEvent.level).toBe('info')
      expect(startEvent.timestamp).toBeInstanceOf(Date)
    })

    it('should emit project loading events', async () => {
      await expect(deployer.run()).resolves.not.toThrow()

      const loadingStartedEvent = emittedEvents.find(e => e.type === 'project_loading_started')
      expect(loadingStartedEvent).toBeDefined()
      expect(loadingStartedEvent.data.projectRoot).toBe('/test/project')

      const loadedEvent = emittedEvents.find(e => e.type === 'project_loaded')
      expect(loadedEvent).toBeDefined()
      expect(loadedEvent.data.jobCount).toBe(1)
      expect(loadedEvent.data.templateCount).toBe(0)
    })

    it('should emit execution plan event', async () => {
      await expect(deployer.run()).resolves.not.toThrow()

      const planEvent = emittedEvents.find(e => e.type === 'execution_plan')
      expect(planEvent).toBeDefined()
      expect(planEvent.data.targetNetworks).toEqual([{
        name: 'localhost',
        chainId: 1337
      }])
      expect(planEvent.data.jobExecutionOrder).toEqual(['test-job'])
    })

    it('should emit network_started event for each network', async () => {
      await expect(deployer.run()).resolves.not.toThrow()

      const networkEvent = emittedEvents.find(e => e.type === 'network_started')
      expect(networkEvent).toBeDefined()
      expect(networkEvent.data.networkName).toBe('localhost')
      expect(networkEvent.data.chainId).toBe(1337)
    })

    it('should emit deployment_completed event on success', async () => {
      await expect(deployer.run()).resolves.not.toThrow()

      const completedEvent = emittedEvents.find(e => e.type === 'deployment_completed')
      expect(completedEvent).toBeDefined()
      expect(completedEvent.level).toBe('info')
    })

    it('should emit output writing events', async () => {
      // Mock context.getOutputs to return some outputs
      const { ExecutionEngine } = require('../core/engine')
      ExecutionEngine.mockImplementation(() => ({
        executeJob: jest.fn().mockImplementation((job, context) => {
          // Mock the getOutputs method
          context.getOutputs = jest.fn().mockReturnValue(new Map([
            ['contract.address', '0x1234567890123456789012345678901234567890']
          ]))
        })
      }))

      deployer = new Deployer({
        ...mockOptions,
        eventEmitter
      })

      await expect(deployer.run()).resolves.not.toThrow()

      const outputWritingEvent = emittedEvents.find(e => e.type === 'output_writing_started')
      expect(outputWritingEvent).toBeDefined()

      const outputFileEvent = emittedEvents.find(e => e.type === 'output_file_written')
      expect(outputFileEvent).toBeDefined()
      expect(outputFileEvent.data.relativePath).toBe('output/test-job.json')
    })
  })

  describe('Error Handling', () => {
    it('should emit deployment_failed event on error', async () => {
      // Mock the loader to throw an error
      const { ProjectLoader } = require('../core/loader')
      ProjectLoader.mockImplementation(() => ({
        load: jest.fn().mockRejectedValue(new Error('Test error'))
      }))

      deployer = new Deployer({
        ...mockOptions,
        eventEmitter
      })

      await expect(deployer.run()).rejects.toThrow('Test error')

      const failedEvent = emittedEvents.find(e => e.type === 'deployment_failed')
      expect(failedEvent).toBeDefined()
      expect(failedEvent.level).toBe('error')
      expect(failedEvent.data.error).toBe('Test error')
      expect(failedEvent.data.stack).toBeDefined()
    })
  })

  describe('Network Filtering', () => {
    beforeEach(() => {
      // Reset mocks for this test group
      jest.clearAllMocks()
      
      // Reset the ProjectLoader mock to success
      const { ProjectLoader } = require('../core/loader')
      ProjectLoader.mockImplementation(() => ({
        load: jest.fn().mockResolvedValue(undefined),
        jobs: new Map([
          ['test-job', {
            name: 'test-job',
            version: '1.0.0',
            actions: [],
            depends_on: []
          }]
        ]),
        templates: new Map(),
        artifactRegistry: {
          getByName: jest.fn(),
          getByHash: jest.fn()
        }
      }))
      
      emittedEvents.length = 0 // Clear events array
    })

    it('should emit missing_network_config_warning for unknown chain IDs', async () => {
      deployer = new Deployer({
        ...mockOptions,
        runOnNetworks: [1337, 999], // 999 doesn't exist
        eventEmitter
      })

      await expect(deployer.run()).resolves.not.toThrow()

      const warningEvent = emittedEvents.find(e => e.type === 'missing_network_config_warning')
      expect(warningEvent).toBeDefined()
      expect(warningEvent.data.missingChainIds).toEqual([999])
    })

    // Note: Testing no_outputs event is complex in integration tests
    // as it requires specific job execution scenarios. The event itself
    // is tested in the main deployer tests.
  })

  describe('Event Ordering', () => {
    beforeEach(() => {
      // Reset mocks and create fresh deployer for this test group
      jest.clearAllMocks()
      
      // Reset the ProjectLoader mock to success
      const { ProjectLoader } = require('../core/loader')
      ProjectLoader.mockImplementation(() => ({
        load: jest.fn().mockResolvedValue(undefined),
        jobs: new Map([
          ['test-job', {
            name: 'test-job',
            version: '1.0.0',
            actions: [],
            depends_on: []
          }]
        ]),
        templates: new Map(),
        artifactRegistry: {
          getByName: jest.fn(),
          getByHash: jest.fn()
        }
      }))
      
      emittedEvents.length = 0 // Clear events array
      
      deployer = new Deployer({
        ...mockOptions,
        eventEmitter
      })
    })

    it('should emit events in the correct order', async () => {
      await expect(deployer.run()).resolves.not.toThrow()

      const eventTypes = emittedEvents.map(e => e.type)
      
      // Check that events are in a logical order
      expect(eventTypes.indexOf('deployment_started')).toBeLessThan(
        eventTypes.indexOf('project_loading_started')
      )
      expect(eventTypes.indexOf('project_loaded')).toBeLessThan(
        eventTypes.indexOf('execution_plan')
      )
      expect(eventTypes.indexOf('execution_plan')).toBeLessThan(
        eventTypes.indexOf('network_started')
      )
      expect(eventTypes.indexOf('network_started')).toBeLessThan(
        eventTypes.indexOf('deployment_completed')
      )
    })

    it('should have timestamps in chronological order', async () => {
      deployer = new Deployer({
        ...mockOptions,
        eventEmitter
      })

      await expect(deployer.run()).resolves.not.toThrow()

      // Check that timestamps are increasing
      for (let i = 1; i < emittedEvents.length; i++) {
        expect(emittedEvents[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          emittedEvents[i - 1].timestamp.getTime()
        )
      }
    })
  })

  describe('Event Emitter Access', () => {
    it('should expose the event emitter as a public property', () => {
      expect(deployer.events).toBe(eventEmitter)
      expect(deployer.events).toBeInstanceOf(DeploymentEventEmitter)
    })

    it('should use global singleton when no custom emitter provided', () => {
      const { deploymentEvents } = require('../events')
      const deployerWithoutCustomEmitter = new Deployer(mockOptions)
      
      expect(deployerWithoutCustomEmitter.events).toBe(deploymentEvents)
    })
  })
}) 