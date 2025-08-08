import { Network } from '../../types/network'
import { SourcifyVerificationPlatform } from '../sourcify'

// Mock fetch globally
const mockFetch = jest.fn()
global.fetch = mockFetch as any

describe('Sourcify Verification Platform', () => {
  let platform: SourcifyVerificationPlatform
  let mockNetwork: Network

  beforeEach(() => {
    platform = new SourcifyVerificationPlatform()
    mockNetwork = {
      name: 'Ethereum Mainnet',
      chainId: 1,
      rpcUrl: 'https://mainnet.infura.io/v3/test'
    }
    jest.clearAllMocks()
  })

  describe('platform properties', () => {
    it('should have correct name', () => {
      expect(platform.name).toBe('sourcify')
    })

    it('should not support networks by default when supports is undefined', () => {
      expect(platform.supportsNetwork(mockNetwork)).toBe(false)
    })

    it('should respect network supports configuration', () => {
      const restrictedNetwork: Network = {
        name: 'Custom Network',
        chainId: 999,
        rpcUrl: 'https://custom.rpc',
        supports: ['etherscan_v2'] // Only supports etherscan
      }
      expect(platform.supportsNetwork(restrictedNetwork)).toBe(false)
    })

    it('should be configured by default', () => {
      expect(platform.isConfigured()).toBe(true)
    })

    it('should have no configuration requirements', () => {
      expect(platform.getConfigurationRequirements()).toBe('Sourcify requires no configuration')
    })
  })

  describe('isContractAlreadyVerified', () => {
    it('should return true for verified contract', async () => {
      const mockResponse = [{
        address: '0x1234567890123456789012345678901234567890',
        chainId: '1',
        status: 'perfect'
      }]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const result = await platform.isContractAlreadyVerified(
        '0x1234567890123456789012345678901234567890',
        mockNetwork
      )

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sourcify.dev/server/check-by-addresses?addresses=0x1234567890123456789012345678901234567890&chainIds=1',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal)
        })
      )
    })

    it('should return false for non-verified contract', async () => {
      const mockResponse: any[] = []

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      })

      const result = await platform.isContractAlreadyVerified(
        '0x1234567890123456789012345678901234567890',
        mockNetwork
      )

      expect(result).toBe(false)
    })

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await platform.isContractAlreadyVerified(
        '0x1234567890123456789012345678901234567890',
        mockNetwork
      )

      expect(result).toBe(false)
    })

    it('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      const result = await platform.isContractAlreadyVerified(
        '0x1234567890123456789012345678901234567890',
        mockNetwork
      )

      expect(result).toBe(false)
    })
  })

  describe('verifyContract', () => {
    let mockRequest: any

    beforeEach(() => {
      mockRequest = {
        address: '0x1234567890123456789012345678901234567890',
        contract: {
          uniqueHash: 'test-hash',
          creationCode: '0x608060405234801561001057600080fd5b50',
          sourceName: 'contracts/MyToken.sol',
          contractName: 'MyToken',
          buildInfoId: 'test-build-info',
          compiler: { version: '0.8.19' },
          _sources: new Set(['contracts/MyToken.sol', '/path/to/build-info/test.json'])
        },
        buildInfo: {
          _format: 'hh-sol-build-info-1' as const,
          id: 'test-id',
          solcVersion: '0.8.19',
          solcLongVersion: '0.8.19+commit.7dd6d404',
          input: {
            language: 'Solidity',
            sources: {
              'contracts/MyToken.sol': {
                content: 'contract MyToken { }'
              }
            },
            settings: {
              optimizer: { enabled: true, runs: 200 },
              outputSelection: { '*': { '*': ['*'] } }
            }
          },
          output: {
            contracts: {},
            sources: {}
          }
        },
        network: mockNetwork
      }
    })

    it('should return already verified if contract is verified', async () => {
      // Mock already verified check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([{
          address: '0x1234567890123456789012345678901234567890',
          chainId: '1',
          status: 'perfect'
        }])
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(true)
      expect(result.isAlreadyVerified).toBe(true)
      expect(result.message).toContain('already verified')
    })

    it('should submit verification successfully', async () => {
      // Mock not verified check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      })

      // Mock successful verification
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'perfect'
        })
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(true)
      expect(result.message).toContain('verified successfully')
    })

    it('should handle verification failure', async () => {
      // Mock not verified check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      })

      // Mock failed verification
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: 'error',
          message: 'Compilation failed'
        })
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Compilation failed')
    })

    it('should handle HTTP errors during verification', async () => {
      // Mock not verified check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      })

      // Mock HTTP error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(false)
      expect(result.message).toContain('API request failed')
    })

    it('should treat 409 partial already verified as success (notice)', async () => {
      // Mock not verified check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      })

      // Mock 409 Conflict with partial match message
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error:
              'The contract 0x... on chainId 1 is already partially verified. The provided new source code also yielded a partial match and will not be stored unless it\'s a full match',
            message:
              'The contract 0x... on chainId 1 is already partially verified. The provided new source code also yielded a partial match and will not be stored unless it\'s a full match'
          })
        )
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(true)
      expect(result.isAlreadyVerified).toBe(true)
      expect(result.message.toLowerCase()).toContain('partially verified')
    })

    it('should handle network errors during verification', async () => {
      // Mock not verified check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([])
      })

      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Network timeout')
    })
  })
})