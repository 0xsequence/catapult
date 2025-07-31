import { DeploymentEventEmitter, CLIEventAdapter } from '../index'
import { DeploymentEvent } from '../types'

describe('Event System', () => {
  let eventEmitter: DeploymentEventEmitter
  let cliAdapter: CLIEventAdapter
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    eventEmitter = new DeploymentEventEmitter()
    cliAdapter = new CLIEventAdapter(eventEmitter, 3)
    
    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    cliAdapter.destroy()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('DeploymentEventEmitter', () => {
    it('should emit events with automatic timestamp', () => {
      const eventHandler = jest.fn()
      eventEmitter.onAnyEvent(eventHandler)

      eventEmitter.emitEvent({
        type: 'deployment_started',
        level: 'info',
        data: {
          projectRoot: '/test/project'
        }
      })

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_started',
          level: 'info',
          data: {
            projectRoot: '/test/project'
          },
          timestamp: expect.any(Date)
        })
      )
    })

    it('should emit on both specific event type and general event channel', () => {
      const specificHandler = jest.fn()
      const generalHandler = jest.fn()

      eventEmitter.onEvent('job_started', specificHandler)
      eventEmitter.onAnyEvent(generalHandler)

      eventEmitter.emitEvent({
        type: 'job_started',
        level: 'info',
        data: {
          jobName: 'test-job',
          jobVersion: '1.0.0',
          networkName: 'localhost',
          chainId: 1337
        }
      })

      expect(specificHandler).toHaveBeenCalledTimes(1)
      expect(generalHandler).toHaveBeenCalledTimes(1)
    })

    it('should handle events without data property', () => {
      const eventHandler = jest.fn()
      eventEmitter.onAnyEvent(eventHandler)

      eventEmitter.emitEvent({
        type: 'deployment_completed',
        level: 'info'
      })

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_completed',
          level: 'info',
          timestamp: expect.any(Date)
        })
      )
    })
  })

  describe('CLIEventAdapter', () => {
    it('should output deployment started event', () => {
      eventEmitter.emitEvent({
        type: 'deployment_started',
        level: 'info',
        data: {
          projectRoot: '/test/project'
        }
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('CATAPULT: STARTING DEPLOYMENT RUN')
      )
    })

    it('should output project loading events', () => {
      eventEmitter.emitEvent({
        type: 'project_loading_started',
        level: 'info',
        data: {
          projectRoot: '/test/project'
        }
      })

      eventEmitter.emitEvent({
        type: 'project_loaded',
        level: 'info',
        data: {
          jobCount: 3,
          templateCount: 5
        }
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1. Loading project from: /test/project')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 3 jobs, 5 templates, and registered artifacts.')
      )
    })

    it('should output execution plan', () => {
      eventEmitter.emitEvent({
        type: 'execution_plan',
        level: 'info',
        data: {
          targetNetworks: [
            { name: 'localhost', chainId: 1337 },
            { name: 'sepolia', chainId: 11155111 }
          ],
          jobExecutionOrder: ['deploy-factory', 'deploy-proxy']
        }
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('2. Execution Plan')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Target Networks: localhost (ChainID: 1337), sepolia (ChainID: 11155111)')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Job Execution Order: deploy-factory -> deploy-proxy')
      )
    })

    it('should output job execution events', () => {
      eventEmitter.emitEvent({
        type: 'job_started',
        level: 'info',
        data: {
          jobName: 'test-job',
          jobVersion: '1.0.0',
          networkName: 'localhost',
          chainId: 1337
        }
      })

      eventEmitter.emitEvent({
        type: 'job_completed',
        level: 'info',
        data: {
          jobName: 'test-job',
          networkName: 'localhost',
          chainId: 1337
        }
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀 Starting job: test-job (v1.0.0)')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Job "test-job" completed successfully')
      )
    })

    it('should output transaction events', () => {
      eventEmitter.emitEvent({
        type: 'transaction_sent',
        level: 'info',
        data: {
          to: '0x1234567890123456789012345678901234567890',
          value: '1000000000000000000',
          dataPreview: '0x1234567890abcdef',
          txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
        }
      })

      eventEmitter.emitEvent({
        type: 'transaction_confirmed',
        level: 'info',
        data: {
          txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          blockNumber: 12345
        }
      })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('to: 0x1234567890123456789012345678901234567890')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('tx hash: 0xabcdef')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('tx confirmed in block: 12345')
      )
    })

    it('should output error events', () => {
      eventEmitter.emitEvent({
        type: 'deployment_failed',
        level: 'error',
        data: {
          error: 'Test error message',
          stack: 'Error stack trace'
        }
      })

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('💥 DEPLOYMENT FAILED!')
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error stack trace')
      )
    })

    it('should output warning events', () => {
      eventEmitter.emitEvent({
        type: 'duplicate_artifact_warning',
        level: 'warn',
        data: {
          contractName: 'TestContract',
          path: '/path/to/artifact.json'
        }
      })

      eventEmitter.emitEvent({
        type: 'missing_network_config_warning',
        level: 'warn',
        data: {
          missingChainIds: [1, 137]
        }
      })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate artifact contractName found: "TestContract"')
      )
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not find network configurations for specified chain IDs: 1, 137')
      )
    })

    it('should handle unknown event types gracefully', () => {
      const unknownEvent = {
        type: 'unknown_event_type',
        level: 'info',
        timestamp: new Date(),
        data: { test: 'data' }
      } as any

      // Manually emit to test fallback handling
      eventEmitter.emit('event', unknownEvent)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] unknown_event_type:'),
        unknownEvent
      )
    })
  })

  describe('Event Integration', () => {
    it('should maintain type safety for event data', () => {
      const eventHandler = jest.fn()
      eventEmitter.onEvent('job_started', eventHandler)

      eventEmitter.emitEvent({
        type: 'job_started',
        level: 'info',
        data: {
          jobName: 'test-job',
          jobVersion: '1.0.0',
          networkName: 'localhost',
          chainId: 1337
        }
      })

      const receivedEvent = eventHandler.mock.calls[0][0]
      expect(receivedEvent.data.jobName).toBe('test-job')
      expect(receivedEvent.data.chainId).toBe(1337)
    })

    it('should support multiple listeners for the same event', () => {
      const handler1 = jest.fn()
      const handler2 = jest.fn()

      eventEmitter.onEvent('deployment_completed', handler1)
      eventEmitter.onEvent('deployment_completed', handler2)

      eventEmitter.emitEvent({
        type: 'deployment_completed',
        level: 'info'
      })

      expect(handler1).toHaveBeenCalledTimes(1)
      expect(handler2).toHaveBeenCalledTimes(1)
    })

    it('should remove event listeners correctly', () => {
      const handler = jest.fn()

      eventEmitter.onEvent('deployment_started', handler)
      eventEmitter.offEvent('deployment_started', handler)

      eventEmitter.emitEvent({
        type: 'deployment_started',
        level: 'info',
        data: {
          projectRoot: '/test/project'
        }
      })

      expect(handler).not.toHaveBeenCalled()
    })
  })
}) 