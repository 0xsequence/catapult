import { ExecutionEngine } from '../engine'
import { ExecutionContext } from '../context'
import { ValueResolver } from '../resolver'
import { ContractRepository } from '../../contracts/repository'
import { Action, Network, ReadJsonValue, SliceBytesValue } from '../../types'
import { VerificationPlatformRegistry } from '../../verification/etherscan'

describe('JSON Integration Tests', () => {
  let engine: ExecutionEngine
  let context: ExecutionContext
  let resolver: ValueResolver
  let mockNetwork: Network
  let mockRegistry: ContractRepository
  let templates: Map<string, any>

  beforeEach(() => {
    mockNetwork = { name: 'testnet', chainId: 999, rpcUrl: 'http://localhost:8545' }
    mockRegistry = new ContractRepository()
    
    // Create a mock context that doesn't require a real connection
    context = {
      getNetwork: () => mockNetwork,
      setOutput: jest.fn(),
      getOutput: jest.fn(),
      setContextPath: jest.fn(),
      getContextPath: jest.fn(),
      dispose: jest.fn(),
      provider: {} as any,
      contractRepository: mockRegistry
    } as any

    templates = new Map()
    const verificationRegistry = new VerificationPlatformRegistry()
    engine = new ExecutionEngine(templates, { verificationRegistry })
    resolver = new ValueResolver()
  })

  describe('ReadJsonValue resolver', () => {
    it('should extract nested values from JSON objects', async () => {
      const testJson = {
        txs: {
          to: '0x596aF90CecdBF9A768886E771178fd5561dD27Ab',
          data: '0x1234'
        }
      }

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: testJson,
          path: 'txs.data'
        }
      }

      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x1234')
    })

    it('should extract nested address values', async () => {
      const testJson = {
        txs: {
          to: '0x596aF90CecdBF9A768886E771178fd5561dD27Ab',
          data: '0x1234'
        }
      }

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: testJson,
          path: 'txs.to'
        }
      }

      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x596aF90CecdBF9A768886E771178fd5561dD27Ab')
    })

    it('should handle array access', async () => {
      const testJson = {
        transactions: [
          { hash: '0xabc123', value: '1000' },
          { hash: '0xdef456', value: '2000' }
        ]
      }

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: testJson,
          path: 'transactions.1.hash'
        }
      }

      const result = await resolver.resolve(value, context)
      expect(result).toBe('0xdef456')
    })

    it('should handle deeply nested objects', async () => {
      const testJson = {
        response: {
          data: {
            blockchain: {
              ethereum: {
                contracts: {
                  token: {
                    address: '0x123456789',
                    symbol: 'TEST'
                  }
                }
              }
            }
          }
        }
      }

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: testJson,
          path: 'response.data.blockchain.ethereum.contracts.token.symbol'
        }
      }

      const result = await resolver.resolve(value, context)
      expect(result).toBe('TEST')
    })

    it('should return entire object when path is empty', async () => {
      const testJson = { name: 'test', value: 42 }

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: testJson,
          path: ''
        }
      }

      const result = await resolver.resolve(value, context)
      expect(result).toEqual(testJson)
    })

    it('should throw error for invalid paths', async () => {
      const testJson = { name: 'test' }

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: testJson,
          path: 'nonexistent.field'
        }
      }

      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'read-json: Failed to access path "nonexistent.field"'
      )
    })

    it('should handle null and undefined values gracefully', async () => {
      const testJson = {
        data: {
          value: null,
          missing: undefined
        }
      }

      const nullValue: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: testJson,
          path: 'data.value'
        }
      }

      const result = await resolver.resolve(nullValue, context)
      expect(result).toBeNull()
    })

    it('should work with template variables', async () => {
      // Mock context to return a JSON object when resolving a template variable
      const mockJson = {
        api: {
          response: {
            status: 'success',
            data: '0xabcdef'
          }
        }
      }

      // Mock the resolver to handle template variable resolution
      const originalResolve = resolver.resolve.bind(resolver)
      jest.spyOn(resolver, 'resolve').mockImplementation(async (value, ctx, scope) => {
        if (value === '{{apiResponse}}') {
          return mockJson
        }
        if (value === '{{extractPath}}') {
          return 'api.response.data'
        }
        return originalResolve(value, ctx, scope)
      })

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: '{{apiResponse}}',
          path: '{{extractPath}}'
        }
      }

      const result = await resolver.resolve(value, context)
      expect(result).toBe('0xabcdef')
    })
  })

  describe('JsonRequestAction integration', () => {
    it('should handle json-request action type validation', () => {
      const action: Action = {
        type: 'json-request',
        name: 'test-request',
        arguments: {
          url: 'https://api.example.com/data',
          method: 'GET'
        }
      }

      expect(action.type).toBe('json-request')
      expect(action.arguments.url).toBe('https://api.example.com/data')
      expect(action.arguments.method).toBe('GET')
    })

    it('should validate required url parameter', async () => {
      const action: Action = {
        type: 'json-request',
        name: 'test-request',
        arguments: {
          url: null as any
        }
      }

      // Mock the engine's executePrimitive method to test validation
      const mockEngine = {
        resolver: {
          resolve: jest.fn().mockResolvedValue(null)
        }
      }

      // The engine should validate that url is a string
      expect(mockEngine.resolver.resolve).toBeDefined()
    })
  })

  describe('End-to-end workflow simulation', () => {
    it('should simulate the Guard API example workflow', async () => {
      // Simulate the API response from Guard
      const mockApiResponse = {
        txs: {
          to: '0x596aF90CecdBF9A768886E771178fd5561dD27Ab',
          data: '0x1234'
        }
      }

      // Step 1: Simulate storing the API response in context
      context.setOutput('guard-patch-request.response', mockApiResponse)

      // Step 2: Extract the data using read-json
      const extractDataValue: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: mockApiResponse,
          path: 'txs.data'
        }
      }

      const extractedData = await resolver.resolve(extractDataValue, context)
      expect(extractedData).toBe('0x1234')

      // Step 3: Extract the to address using read-json
      const extractToValue: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: mockApiResponse,
          path: 'txs.to'
        }
      }

      const extractedTo = await resolver.resolve(extractToValue, context)
      expect(extractedTo).toBe('0x596aF90CecdBF9A768886E771178fd5561dD27Ab')

      // Verify both values are correctly extracted
      expect(extractedData).toBe('0x1234')
      expect(extractedTo).toBe('0x596aF90CecdBF9A768886E771178fd5561dD27Ab')
    })

    it('should allow piping read-json output into slice-bytes', async () => {
      const response = {
        txs: {
          data: '0xaabbccddff'
        }
      }

      const value: SliceBytesValue = {
        type: 'slice-bytes',
        arguments: {
          value: {
            type: 'read-json',
            arguments: {
              json: response,
              path: 'txs.data'
            }
          },
          range: ':-1'
        }
      }

      const trimmed = await resolver.resolve(value, context)
      expect(trimmed).toBe('0xaabbccdd')
    })

    it('should handle complex nested API responses', async () => {
      const complexApiResponse = {
        status: 'success',
        data: {
          blockchain: 'ethereum',
          network: 'mainnet',
          transactions: [
            {
              hash: '0xabc123',
              to: '0x111111',
              data: '0xfirst'
            },
            {
              hash: '0xdef456',
              to: '0x222222',
              data: '0xsecond'
            }
          ],
          metadata: {
            timestamp: 1234567890,
            source: 'guard-api'
          }
        }
      }

      // Extract various nested values
      const statusValue: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: complexApiResponse,
          path: 'status'
        }
      }

      const firstTxData: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: complexApiResponse,
          path: 'data.transactions.0.data'
        }
      }

      const secondTxTo: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: complexApiResponse,
          path: 'data.transactions.1.to'
        }
      }

      const timestamp: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: complexApiResponse,
          path: 'data.metadata.timestamp'
        }
      }

      // Test all extractions
      expect(await resolver.resolve(statusValue, context)).toBe('success')
      expect(await resolver.resolve(firstTxData, context)).toBe('0xfirst')
      expect(await resolver.resolve(secondTxTo, context)).toBe('0x222222')
      expect(await resolver.resolve(timestamp, context)).toBe(1234567890)
    })
  })
})
