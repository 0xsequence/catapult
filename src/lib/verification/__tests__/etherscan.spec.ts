import { submitVerification, checkVerificationStatus, waitForVerification, isContractAlreadyVerified } from '../etherscan'
import { Network } from '../../types/network'
import { BuildInfo } from '../../types/buildinfo'

// Mock global fetch
global.fetch = jest.fn()
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>

describe('Etherscan Verification', () => {
  const mockNetwork: Network = {
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: 'https://mainnet.infura.io/v3/test',
    supports: ['etherscan_v2']
  }

  const mockBuildInfo: BuildInfo = {
    _format: 'hh-sol-build-info-1',
    id: 'test-build-id',
    solcVersion: 'v0.8.25+commit.b61c2a91',
    solcLongVersion: '0.8.25+commit.b61c2a91.Linux.gcc',
    input: {
      language: 'Solidity',
      sources: {
        'contracts/MyToken.sol': {
          content: 'pragma solidity ^0.8.0; contract MyToken { }'
        }
      },
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode']
          }
        }
      }
    },
    output: {
      contracts: {
        'contracts/MyToken.sol': {
          MyToken: {
            abi: [],
            evm: {
              bytecode: { object: '0x608060405234801561001057600080fd5b50' },
              deployedBytecode: { object: '0x6080604052348015600f57600080fd5b50' }
            }
          }
        }
      },
      sources: {
        'contracts/MyToken.sol': { id: 0 }
      }
    }
  }

  const mockContract = {
    contractName: 'MyToken',
    sourceName: 'contracts/MyToken.sol',
    abi: [],
    creationCode: '0x608060405234801561001057600080fd5b50',
    uniqueHash: 'test-hash',
    _sources: new Set(['/test/path'])
  } as any

  const createMockResponse = (data: any, ok = true, status = 200) => ({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: jest.fn().mockResolvedValue(data)
  } as any)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('submitVerification', () => {
    it('should submit verification successfully', async () => {
      const mockResponseData = {
        status: '1',
        result: 'test-guid-123'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))



      const result = await submitVerification({
        address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
        buildInfo: mockBuildInfo,
        contract: mockContract,
        network: mockNetwork
      }, 'test-api-key')

      expect(result.success).toBe(true)
      expect(result.guid).toBe('test-guid-123')
      expect(result.message).toBe('Verification submitted successfully')

      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.etherscan.io/v2/api?chainid=1',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: expect.any(String)
        })
      )
    })

    it('should handle verification submission failure', async () => {
      const mockResponseData = {
        status: '0',
        result: 'Invalid contract address'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      const result = await submitVerification({
        address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
        buildInfo: mockBuildInfo,
        contract: mockContract,
        network: mockNetwork
      }, 'test-api-key')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid contract address')
      expect(result.guid).toBeUndefined()
    })

    it('should include constructor arguments when provided', async () => {
      const mockResponseData = {
        status: '1',
        result: 'test-guid-456'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      await submitVerification({
        address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
        buildInfo: mockBuildInfo,
        contract: mockContract,
        constructorArguments: '0x000000000000000000000000742d35cc6596c743b2c8d12cd84d5b8fba4f3c',
        network: mockNetwork
      }, 'test-api-key')

      const fetchCall = mockedFetch.mock.calls[0]
      const requestBody = fetchCall[1]?.body as string
      expect(requestBody).toContain('constructorArguements=000000000000000000000000742d35cc6596c743b2c8d12cd84d5b8fba4f3c')
    })

    it('should handle network request errors', async () => {
      mockedFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await submitVerification({
        address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
        buildInfo: mockBuildInfo,
        contract: mockContract,
        network: mockNetwork
      }, 'test-api-key')

      expect(result.success).toBe(false)
      expect(result.message).toContain('API request failed: Network error')
    })

    it('should use correct API URL for different networks', async () => {
      const sepoliaNetwork: Network = {
        name: 'Sepolia',
        chainId: 11155111,
        rpcUrl: 'https://sepolia.infura.io/v3/test'
      }

      const mockResponseData = {
        status: '1',
        result: 'test-guid-sepolia'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      await submitVerification({
        address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
        buildInfo: mockBuildInfo,
        contract: mockContract,
        network: sepoliaNetwork
      }, 'test-api-key')

      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.etherscan.io/v2/api?chainid=11155111',
        expect.any(Object)
      )
    })

    it('should use v2 API format for any network', async () => {
      const customNetwork: Network = {
        name: 'Custom Network',
        chainId: 999999,
        rpcUrl: 'https://custom.rpc'
      }

      const mockResponseData = {
        status: '0',
        result: 'Invalid chain ID'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      const result = await submitVerification({
        address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
        buildInfo: mockBuildInfo,
        contract: mockContract,
        network: customNetwork
      }, 'test-api-key')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid chain ID')
      expect(mockedFetch).toHaveBeenCalledWith(
        'https://api.etherscan.io/v2/api?chainid=999999',
        expect.any(Object)
      )
    })

    it('should treat "Already Verified" as success', async () => {
      const mockResponseData = {
        status: '0',
        result: 'Already Verified'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      const result = await submitVerification({
        address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
        buildInfo: mockBuildInfo,
        contract: mockContract,
        network: mockNetwork
      }, 'test-api-key')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Contract is already verified')
      expect(result.guid).toBeUndefined()
    })

    it('should treat "Contract source code already verified" as success', async () => {
      const mockResponseData = {
        status: '0',
        result: 'Contract source code already verified'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      const result = await submitVerification({
        address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
        buildInfo: mockBuildInfo,
        contract: mockContract,
        network: mockNetwork
      }, 'test-api-key')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Contract is already verified')
      expect(result.guid).toBeUndefined()
    })

    describe('retry logic', () => {
      beforeEach(() => {
        // Mock console.log to avoid noise in test output
        jest.spyOn(console, 'log').mockImplementation(() => {})
        // Mock setTimeout to make tests run faster
        jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
          callback()
          return {} as any
        })
      })

      afterEach(() => {
        jest.restoreAllMocks()
      })

      it('should retry for "unable to locate contractcode" error', async () => {
        const contractNotFoundResponse = {
          status: '0',
          result: 'Unable to locate ContractCode at 0x123...'
        }
        const successResponse = {
          status: '1',
          result: 'test-guid-retry'
        }

        mockedFetch
          .mockResolvedValueOnce(createMockResponse(contractNotFoundResponse))
          .mockResolvedValueOnce(createMockResponse(successResponse))

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork,
          maxRetries: 3,
          retryDelayMs: 100
        }, 'test-api-key')

        expect(result.success).toBe(true)
        expect(result.guid).toBe('test-guid-retry')
        expect(mockedFetch).toHaveBeenCalledTimes(2)
        expect(console.log).toHaveBeenCalledWith(
          expect.stringContaining('Verification attempt 1 failed with "contract not found" error')
        )
      })

      it('should retry for "contract source code not verified" error', async () => {
        const contractNotFoundResponse = {
          status: '0',
          result: 'Contract source code not verified'
        }
        const successResponse = {
          status: '1',
          result: 'test-guid-retry-2'
        }

        mockedFetch
          .mockResolvedValueOnce(createMockResponse(contractNotFoundResponse))
          .mockResolvedValueOnce(createMockResponse(successResponse))

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork,
          maxRetries: 2
        }, 'test-api-key')

        expect(result.success).toBe(true)
        expect(result.guid).toBe('test-guid-retry-2')
        expect(mockedFetch).toHaveBeenCalledTimes(2)
      })

      it('should retry for "contract not found" error', async () => {
        const contractNotFoundResponse = {
          status: '0',
          result: 'Contract not found'
        }
        const successResponse = {
          status: '1',
          result: 'test-guid-retry-3'
        }

        mockedFetch
          .mockResolvedValueOnce(createMockResponse(contractNotFoundResponse))
          .mockResolvedValueOnce(createMockResponse(successResponse))

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork
        }, 'test-api-key')

        expect(result.success).toBe(true)
        expect(result.guid).toBe('test-guid-retry-3')
        expect(mockedFetch).toHaveBeenCalledTimes(2)
      })

      it('should not retry for non-contract-not-found errors', async () => {
        const invalidResponse = {
          status: '0',
          result: 'Invalid API key'
        }

        mockedFetch.mockResolvedValueOnce(createMockResponse(invalidResponse))

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork,
          maxRetries: 3
        }, 'test-api-key')

        expect(result.success).toBe(false)
        expect(result.message).toBe('Invalid API key')
        expect(mockedFetch).toHaveBeenCalledTimes(1) // No retries
      })

      it('should exhaust all retries and return failure message', async () => {
        const contractNotFoundResponse = {
          status: '0',
          result: 'Unable to locate ContractCode'
        }

        mockedFetch.mockResolvedValue(createMockResponse(contractNotFoundResponse))

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork,
          maxRetries: 2,
          retryDelayMs: 10
        }, 'test-api-key')

        expect(result.success).toBe(false)
        expect(result.message).toBe('Verification failed after 3 attempts. Last error: Unable to locate ContractCode')
        expect(mockedFetch).toHaveBeenCalledTimes(3) // Initial + 2 retries
      })

      it('should use default retry settings when not specified', async () => {
        const contractNotFoundResponse = {
          status: '0',
          result: 'Contract not found'
        }

        mockedFetch.mockResolvedValue(createMockResponse(contractNotFoundResponse))

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork
          // No maxRetries or retryDelayMs specified - should use defaults
        }, 'test-api-key')

        expect(result.success).toBe(false)
        expect(result.message).toBe('Verification failed after 4 attempts. Last error: Contract not found')
        expect(mockedFetch).toHaveBeenCalledTimes(4) // Initial + 3 default retries
      })

      it('should retry for network errors with contract not found message', async () => {
        const contractNotFoundError = new Error('Unable to locate ContractCode')
        const successResponse = {
          status: '1',
          result: 'test-guid-network-retry'
        }

        mockedFetch
          .mockRejectedValueOnce(contractNotFoundError)
          .mockResolvedValueOnce(createMockResponse(successResponse))

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork,
          maxRetries: 2
        }, 'test-api-key')

        expect(result.success).toBe(true)
        expect(result.guid).toBe('test-guid-network-retry')
        expect(mockedFetch).toHaveBeenCalledTimes(2)
      })

      it('should not retry for network errors without contract not found message', async () => {
        const networkError = new Error('Network timeout')

        mockedFetch.mockRejectedValueOnce(networkError)

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork,
          maxRetries: 3
        }, 'test-api-key')

        expect(result.success).toBe(false)
        expect(result.message).toBe('API request failed: Network timeout')
        expect(mockedFetch).toHaveBeenCalledTimes(1) // No retries
      })

      it('should exhaust retries for network errors with contract not found message', async () => {
        const contractNotFoundError = new Error('Contract source code not verified')

        mockedFetch.mockRejectedValue(contractNotFoundError)

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork,
          maxRetries: 1,
          retryDelayMs: 10
        }, 'test-api-key')

        expect(result.success).toBe(false)
        expect(result.message).toBe('API request failed: Contract source code not verified')
        expect(mockedFetch).toHaveBeenCalledTimes(2) // Initial + 1 retry
      })

      it('should handle case-insensitive error message matching', async () => {
        const contractNotFoundResponse = {
          status: '0',
          result: 'UNABLE TO LOCATE CONTRACTCODE'
        }
        const successResponse = {
          status: '1',
          result: 'test-guid-case-insensitive'
        }

        mockedFetch
          .mockResolvedValueOnce(createMockResponse(contractNotFoundResponse))
          .mockResolvedValueOnce(createMockResponse(successResponse))

        const result = await submitVerification({
          address: '0x742d35Cc6596C743B2c8d12Cd84d5B8FbA4F3C',
          buildInfo: mockBuildInfo,
          contract: mockContract,
          network: mockNetwork,
          maxRetries: 1
        }, 'test-api-key')

        expect(result.success).toBe(true)
        expect(result.guid).toBe('test-guid-case-insensitive')
        expect(mockedFetch).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('checkVerificationStatus', () => {
    it('should return success status', async () => {
      const mockResponseData = {
        status: '1',
        result: 'Pass - Verified'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      const status = await checkVerificationStatus('test-guid', 'test-api-key', mockNetwork)

      expect(status.isComplete).toBe(true)
      expect(status.isSuccess).toBe(true)
      expect(status.message).toBe('Verification successful')
    })

    it('should return pending status', async () => {
      const mockResponseData = {
        status: '0',
        result: 'Pending in queue'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      const status = await checkVerificationStatus('test-guid', 'test-api-key', mockNetwork)

      expect(status.isComplete).toBe(false)
      expect(status.isSuccess).toBe(false)
      expect(status.message).toBe('Verification pending')
    })

    it('should return failure status', async () => {
      const mockResponseData = {
        status: '0',
        result: 'Fail - Unable to verify'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      const status = await checkVerificationStatus('test-guid', 'test-api-key', mockNetwork)

      expect(status.isComplete).toBe(true)
      expect(status.isSuccess).toBe(false)
      expect(status.message).toBe('Fail - Unable to verify')
    })

    it('should treat "Already Verified" as success in status check', async () => {
      const mockResponseData = {
        status: '0',
        result: 'Already Verified'
      }
      mockedFetch.mockResolvedValueOnce(createMockResponse(mockResponseData))

      const status = await checkVerificationStatus('test-guid', 'test-api-key', mockNetwork)

      expect(status.isComplete).toBe(true)
      expect(status.isSuccess).toBe(true)
      expect(status.message).toBe('Contract is already verified')
    })
  })

  describe('waitForVerification', () => {
    it('should return when verification completes successfully', async () => {
      mockedFetch
        .mockResolvedValueOnce(createMockResponse({
          status: '0', result: 'Pending in queue'
        }))
        .mockResolvedValueOnce(createMockResponse({
          status: '1', result: 'Pass - Verified'
        }))

      const status = await waitForVerification('test-guid', 'test-api-key', mockNetwork, 10000)

      expect(status.isComplete).toBe(true)
      expect(status.isSuccess).toBe(true)
      expect(mockedFetch).toHaveBeenCalledTimes(2)
    })

    it('should timeout after specified duration', async () => {
      mockedFetch.mockResolvedValue(createMockResponse({
        status: '0', result: 'Pending in queue'
      }))

      await expect(
        waitForVerification('test-guid', 'test-api-key', mockNetwork, 1000)
      ).rejects.toThrow('Verification timed out after 1 seconds')

      expect(mockedFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('isContractAlreadyVerified', () => {
    const testAddress = '0x1234567890123456789012345678901234567890'
    const testApiKey = 'test-api-key'

    beforeEach(() => {
      mockedFetch.mockClear()
    })

    it('should return true when contract is verified', async () => {
      mockedFetch.mockResolvedValueOnce(createMockResponse({
        status: '1',
        result: [{
          SourceCode: 'pragma solidity ^0.8.0; contract MyToken { }'
        }]
      }))

      const result = await isContractAlreadyVerified(testAddress, testApiKey, mockNetwork)

      expect(result).toBe(true)
      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('chainid=1'),
        expect.objectContaining({
          method: 'GET'
        })
      )
    })

    it('should return false when contract is not verified (empty source code)', async () => {
      mockedFetch.mockResolvedValueOnce(createMockResponse({
        status: '1',
        result: [{
          SourceCode: ''
        }]
      }))

      const result = await isContractAlreadyVerified(testAddress, testApiKey, mockNetwork)

      expect(result).toBe(false)
    })

    it('should return false when API returns status 0', async () => {
      mockedFetch.mockResolvedValueOnce(createMockResponse({
        status: '0',
        result: 'Contract source code not verified'
      }))

      const result = await isContractAlreadyVerified(testAddress, testApiKey, mockNetwork)

      expect(result).toBe(false)
    })

    it('should return false when result array is empty', async () => {
      mockedFetch.mockResolvedValueOnce(createMockResponse({
        status: '1',
        result: []
      }))

      const result = await isContractAlreadyVerified(testAddress, testApiKey, mockNetwork)

      expect(result).toBe(false)
    })

    it('should return false and log warning when API request fails', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      mockedFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await isContractAlreadyVerified(testAddress, testApiKey, mockNetwork)

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to check verification status for ${testAddress}`)
      )

      consoleSpy.mockRestore()
    })

    it('should return false when HTTP response is not ok', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      mockedFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response)

      const result = await isContractAlreadyVerified(testAddress, testApiKey, mockNetwork)

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check verification status')
      )

      consoleSpy.mockRestore()
    })

    it('should use correct chainId in API call for different networks', async () => {
      const arbitrumNetwork: Network = {
        name: 'Arbitrum One',
        chainId: 42161,
        rpcUrl: 'https://arb1.arbitrum.io/rpc',
        supports: ['etherscan_v2']
      }

      mockedFetch.mockResolvedValueOnce(createMockResponse({
        status: '1',
        result: [{
          SourceCode: 'contract code'
        }]
      }))

      await isContractAlreadyVerified(testAddress, testApiKey, arbitrumNetwork)

      expect(mockedFetch).toHaveBeenCalledWith(
        expect.stringContaining('chainid=42161'),
        expect.any(Object)
      )
    })
  })
}) 