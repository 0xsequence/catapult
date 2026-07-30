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
    it('should return true for an exact match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ match: 'exact_match' })
      })

      const result = await platform.isContractAlreadyVerified(
        '0x1234567890123456789012345678901234567890',
        mockNetwork
      )

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://sourcify.dev/server/v2/contract/1/0x1234567890123456789012345678901234567890?fields=match',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal)
        })
      )
    })

    it('should return true for a partial match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ match: 'match' })
      })

      const result = await platform.isContractAlreadyVerified(
        '0x1234567890123456789012345678901234567890',
        mockNetwork
      )

      expect(result).toBe(true)
    })

    it('should return false for a non-verified contract (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
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
          _sources: new Set(['contracts/MyToken.sol'])
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
        status: 200,
        json: jest.fn().mockResolvedValue({ match: 'exact_match' })
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(true)
      expect(result.isAlreadyVerified).toBe(true)
      expect(result.message).toContain('already verified')
    })

    it('should submit verification and poll the job until completion', async () => {
      // Mock not verified check
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 404
      })

      // Mock successful submission (202 Accepted)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ verificationId: 'job-1' })
      })

      // Mock job poll - completed with an exact match
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          isJobCompleted: true,
          contract: { match: 'exact_match' }
        })
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(true)
      expect(result.message).toContain('verified successfully')
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://sourcify.dev/server/v2/verify/1/0x1234567890123456789012345678901234567890',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      )
      const submittedBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(submittedBody).toEqual({
        stdJsonInput: {
          language: 'Solidity',
          sources: mockRequest.buildInfo.input.sources,
          settings: mockRequest.buildInfo.input.settings
        },
        compilerVersion: '0.8.19+commit.7dd6d404',
        contractIdentifier: 'contracts/MyToken.sol:MyToken'
      })
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://sourcify.dev/server/v2/verify/job-1',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('should prefer the full commit-hash compiler version from contract metadata over a short solcLongVersion (Foundry-style build-info)', async () => {
      // Foundry/ethers-rs build-info reports solcLongVersion without a commit hash
      mockRequest.buildInfo.solcVersion = '0.8.30'
      mockRequest.buildInfo.solcLongVersion = '0.8.30'
      mockRequest.buildInfo.output.contracts = {
        'contracts/MyToken.sol': {
          MyToken: { metadata: JSON.stringify({ compiler: { version: '0.8.30+commit.73712a01' } }) }
        }
      }

      mockFetch.mockResolvedValueOnce({ ok: true, status: 404 })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ verificationId: 'job-1' })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          isJobCompleted: true,
          contract: { match: 'exact_match' }
        })
      })

      await platform.verifyContract(mockRequest)

      const submittedBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(submittedBody.compilerVersion).toBe('0.8.30+commit.73712a01')
    })

    it('should treat an "already_verified" job error as success, not failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 404 })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ verificationId: 'job-1' })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          isJobCompleted: true,
          contract: { match: null },
          error: {
            customCode: 'already_verified',
            message: "The contract is already verified and the job didn't yield a better match."
          }
        })
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(true)
      expect(result.isAlreadyVerified).toBe(true)
      expect(result.message).toContain('already verified')
    })

    it('should handle a job that completes with no match', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 404 })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ verificationId: 'job-1' })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          isJobCompleted: true,
          contract: { match: null },
          error: { message: 'Compilation failed' }
        })
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Compilation failed')
    })

    it('should handle HTTP errors during submission', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 404 })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('')
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(false)
      expect(result.message).toContain('API request failed')
    })

    it('should treat a 409 "already verified" conflict as success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 404 })
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        text: jest.fn().mockResolvedValue(
          JSON.stringify({ message: 'The contract is already verified' })
        )
      })

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(true)
      expect(result.isAlreadyVerified).toBe(true)
    })

    it('should handle network errors during verification', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 404 })
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'))

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(false)
      expect(result.message).toContain('Network timeout')
    })

    it('should fail fast when contract is missing source/contract name', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 404 })
      mockRequest.contract.sourceName = undefined

      const result = await platform.verifyContract(mockRequest)

      expect(result.success).toBe(false)
      expect(result.message).toContain('missing sourceName/contractName')
    })
  })
})
