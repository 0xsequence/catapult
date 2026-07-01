import { detectNetworkFromRpc, isValidRpcUrl } from '../network-utils'
import { Network } from '../types'

// Mock ethers.JsonRpcProvider
jest.mock('ethers', () => ({
  ...jest.requireActual('ethers'),
  ethers: {
    ...jest.requireActual('ethers').ethers,
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getNetwork: jest.fn()
    }))
  }
}))

describe('Network Utils', () => {
  describe('isValidRpcUrl', () => {
    it('should validate valid HTTP RPC URLs', () => {
      expect(isValidRpcUrl('http://localhost:8545')).toBe(true)
      expect(isValidRpcUrl('https://mainnet.infura.io/v3/abc123')).toBe(true)
    })

    it('should validate valid WebSocket RPC URLs', () => {
      expect(isValidRpcUrl('ws://localhost:8545')).toBe(true)
      expect(isValidRpcUrl('wss://mainnet.infura.io/v3/abc123')).toBe(true)
    })

    it('should reject invalid URLs', () => {
      expect(isValidRpcUrl('invalid-url')).toBe(false)
      expect(isValidRpcUrl('ftp://example.com')).toBe(false)
      expect(isValidRpcUrl('')).toBe(false)
    })

    it('should reject URLs without hostname', () => {
      expect(isValidRpcUrl('http://')).toBe(false)
    })
  })

  describe('detectNetworkFromRpc', () => {
    let mockGetNetwork: jest.Mock

    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks()
      
      // Mock the JsonRpcProvider constructor and getNetwork method
      const { ethers } = require('ethers')
      mockGetNetwork = jest.fn()
      
      // Mock the provider's getNetwork method
      ethers.JsonRpcProvider.mockImplementation(() => ({
        getNetwork: mockGetNetwork
      }))
    })

    it('should detect network successfully', async () => {
      const mockNetwork = {
        name: 'mainnet',
        chainId: 1
      }
      
      mockGetNetwork.mockResolvedValue(mockNetwork)

      const result = await detectNetworkFromRpc('https://mainnet.infura.io/v3/abc123')

      expect(result).toEqual({
        name: 'mainnet',
        chainId: 1,
        rpcUrl: 'https://mainnet.infura.io/v3/abc123',
        platform: 'evm'
      })

      // Verify provider was created with correct URL
      const { ethers } = require('ethers')
      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith('https://mainnet.infura.io/v3/abc123')
    })

    it('should handle network with unknown name', async () => {
      const mockNetwork = {
        name: 'unknown',
        chainId: 31337
      }
      
      mockGetNetwork.mockResolvedValue(mockNetwork)

      const result = await detectNetworkFromRpc('http://localhost:8545')

      expect(result).toEqual({
        name: 'unknown',
        chainId: 31337,
        rpcUrl: 'http://localhost:8545',
        platform: 'evm'
      })
    })

    it('should handle connection errors', async () => {
      mockGetNetwork.mockRejectedValue(new Error('Connection failed'))

      await expect(detectNetworkFromRpc('http://localhost:8545'))
        .rejects.toThrow('Failed to detect network from RPC URL "http://localhost:8545": Connection failed')
    })

    it('should handle network detection errors', async () => {
      mockGetNetwork.mockRejectedValue(new Error('Network not supported'))

      await expect(detectNetworkFromRpc('http://invalid-rpc.com'))
        .rejects.toThrow('Failed to detect network from RPC URL "http://invalid-rpc.com": Network not supported')
    })
  })

  describe('Integration with Run Command', () => {
    it('should create a complete Network object from detected information', async () => {
      const { ethers } = require('ethers')

      const mockNetwork = {
        name: 'sepolia',
        chainId: 11155111,
      }

      const getNetworkMock = jest.fn().mockResolvedValue(mockNetwork)
      ethers.JsonRpcProvider.mockImplementation(() => ({
        getNetwork: getNetworkMock,
      }))

      const detectedInfo = await detectNetworkFromRpc('https://sepolia.infura.io/v3/abc123')

      // Simulate what the run command does
      const customNetwork: Network = {
        name: detectedInfo.name || `custom-${detectedInfo.chainId}`,
        chainId: detectedInfo.chainId!,
        rpcUrl: 'https://sepolia.infura.io/v3/abc123',
        platform: detectedInfo.platform || 'evm',
        supports: detectedInfo.supports || [],
        gasLimit: detectedInfo.gasLimit,
        testnet: detectedInfo.testnet,
        evmVersion: detectedInfo.evmVersion,
        params: detectedInfo.params,
      }

      expect(customNetwork).toEqual({
        name: 'sepolia',
        chainId: 11155111,
        rpcUrl: 'https://sepolia.infura.io/v3/abc123',
        platform: 'evm',
        supports: [],
        gasLimit: undefined,
        testnet: undefined,
        evmVersion: undefined,
        params: undefined,
      })
    })

    it('should merge params and other yaml fields when chainId matches networks.yaml', async () => {
      const { ethers } = require('ethers')

      const getNetworkMock = jest.fn().mockResolvedValue({ name: 'unknown', chainId: 137 })
      ethers.JsonRpcProvider.mockImplementation(() => ({
        getNetwork: getNetworkMock,
      }))

      const detectedInfo = await detectNetworkFromRpc('http://127.0.0.1:8545')
      const knownNetwork: Network = {
        name: 'Polygon',
        chainId: 137,
        rpcUrl: 'https://nodes.sequence.app/polygon/token',
        supports: ['etherscan_v2', 'sourcify'],
        testnet: false,
        evmVersion: 'paris',
        params: { trailsOnly: false },
      }

      // Simulate what the run command does
      const customNetwork: Network = {
        name: detectedInfo.name || knownNetwork.name || `custom-${detectedInfo.chainId}`,
        chainId: detectedInfo.chainId!,
        rpcUrl: 'http://127.0.0.1:8545',
        platform: detectedInfo.platform || knownNetwork.platform || 'evm',
        supports: detectedInfo.supports || knownNetwork.supports || [],
        gasLimit: detectedInfo.gasLimit || knownNetwork.gasLimit,
        testnet: detectedInfo.testnet !== undefined ? detectedInfo.testnet : knownNetwork.testnet,
        evmVersion: detectedInfo.evmVersion || knownNetwork.evmVersion,
        params: detectedInfo.params || knownNetwork.params,
      }

      expect(customNetwork).toEqual({
        name: 'unknown',
        chainId: 137,
        rpcUrl: 'http://127.0.0.1:8545',
        platform: 'evm',
        supports: ['etherscan_v2', 'sourcify'],
        gasLimit: undefined,
        testnet: false,
        evmVersion: 'paris',
        params: { trailsOnly: false },
      })
    })

    it('should handle partial network information gracefully', async () => {
      const { ethers } = require('ethers')

      const mockNetwork = {
        name: 'unknown',
        chainId: 42,
      }

      const getNetworkMock = jest.fn().mockResolvedValue(mockNetwork)
      ethers.JsonRpcProvider.mockImplementation(() => ({
        getNetwork: getNetworkMock,
      }))

      const detectedInfo = await detectNetworkFromRpc('http://custom-network:8545')

      // Simulate what the run command does
      const customNetwork: Network = {
        name: detectedInfo.name || `custom-${detectedInfo.chainId}`,
        chainId: detectedInfo.chainId!,
        rpcUrl: 'http://custom-network:8545',
        platform: detectedInfo.platform || 'evm',
        supports: detectedInfo.supports || [],
        gasLimit: detectedInfo.gasLimit,
        testnet: detectedInfo.testnet,
        evmVersion: detectedInfo.evmVersion,
        params: detectedInfo.params,
      }

      expect(customNetwork).toEqual({
        name: 'unknown',
        chainId: 42,
        rpcUrl: 'http://custom-network:8545',
        platform: 'evm',
        supports: [],
        gasLimit: undefined,
        testnet: undefined,
        evmVersion: undefined,
        params: undefined,
      })
    })
  })
})
