"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const network_utils_1 = require("../network-utils");
jest.mock('ethers', () => ({
    ...jest.requireActual('ethers'),
    ethers: {
        ...jest.requireActual('ethers').ethers,
        JsonRpcProvider: jest.fn().mockImplementation(() => ({
            getNetwork: jest.fn()
        }))
    }
}));
describe('Network Utils', () => {
    describe('isValidRpcUrl', () => {
        it('should validate valid HTTP RPC URLs', () => {
            expect((0, network_utils_1.isValidRpcUrl)('http://localhost:8545')).toBe(true);
            expect((0, network_utils_1.isValidRpcUrl)('https://mainnet.infura.io/v3/abc123')).toBe(true);
        });
        it('should validate valid WebSocket RPC URLs', () => {
            expect((0, network_utils_1.isValidRpcUrl)('ws://localhost:8545')).toBe(true);
            expect((0, network_utils_1.isValidRpcUrl)('wss://mainnet.infura.io/v3/abc123')).toBe(true);
        });
        it('should reject invalid URLs', () => {
            expect((0, network_utils_1.isValidRpcUrl)('invalid-url')).toBe(false);
            expect((0, network_utils_1.isValidRpcUrl)('ftp://example.com')).toBe(false);
            expect((0, network_utils_1.isValidRpcUrl)('')).toBe(false);
        });
        it('should reject URLs without hostname', () => {
            expect((0, network_utils_1.isValidRpcUrl)('http://')).toBe(false);
        });
    });
    describe('detectNetworkFromRpc', () => {
        let mockGetNetwork;
        beforeEach(() => {
            jest.clearAllMocks();
            const { ethers } = require('ethers');
            mockGetNetwork = jest.fn();
            ethers.JsonRpcProvider.mockImplementation(() => ({
                getNetwork: mockGetNetwork
            }));
        });
        it('should detect network successfully', async () => {
            const mockNetwork = {
                name: 'mainnet',
                chainId: 1
            };
            mockGetNetwork.mockResolvedValue(mockNetwork);
            const result = await (0, network_utils_1.detectNetworkFromRpc)('https://mainnet.infura.io/v3/abc123');
            expect(result).toEqual({
                name: 'mainnet',
                chainId: 1,
                rpcUrl: 'https://mainnet.infura.io/v3/abc123'
            });
            const { ethers } = require('ethers');
            expect(ethers.JsonRpcProvider).toHaveBeenCalledWith('https://mainnet.infura.io/v3/abc123');
        });
        it('should handle network with unknown name', async () => {
            const mockNetwork = {
                name: 'unknown',
                chainId: 31337
            };
            mockGetNetwork.mockResolvedValue(mockNetwork);
            const result = await (0, network_utils_1.detectNetworkFromRpc)('http://localhost:8545');
            expect(result).toEqual({
                name: 'unknown',
                chainId: 31337,
                rpcUrl: 'http://localhost:8545'
            });
        });
        it('should handle connection errors', async () => {
            mockGetNetwork.mockRejectedValue(new Error('Connection failed'));
            await expect((0, network_utils_1.detectNetworkFromRpc)('http://localhost:8545'))
                .rejects.toThrow('Failed to detect network from RPC URL "http://localhost:8545": Connection failed');
        });
        it('should handle network detection errors', async () => {
            mockGetNetwork.mockRejectedValue(new Error('Network not supported'));
            await expect((0, network_utils_1.detectNetworkFromRpc)('http://invalid-rpc.com'))
                .rejects.toThrow('Failed to detect network from RPC URL "http://invalid-rpc.com": Network not supported');
        });
    });
    describe('Integration with Run Command', () => {
        it('should create a complete Network object from detected information', async () => {
            const { ethers } = require('ethers');
            const mockNetwork = {
                name: 'sepolia',
                chainId: 11155111
            };
            const getNetworkMock = jest.fn().mockResolvedValue(mockNetwork);
            ethers.JsonRpcProvider.mockImplementation(() => ({
                getNetwork: getNetworkMock
            }));
            const detectedInfo = await (0, network_utils_1.detectNetworkFromRpc)('https://sepolia.infura.io/v3/abc123');
            const customNetwork = {
                name: detectedInfo.name || `custom-${detectedInfo.chainId}`,
                chainId: detectedInfo.chainId,
                rpcUrl: 'https://sepolia.infura.io/v3/abc123',
                supports: detectedInfo.supports || [],
                gasLimit: detectedInfo.gasLimit,
                testnet: detectedInfo.testnet
            };
            expect(customNetwork).toEqual({
                name: 'sepolia',
                chainId: 11155111,
                rpcUrl: 'https://sepolia.infura.io/v3/abc123',
                supports: [],
                gasLimit: undefined,
                testnet: undefined
            });
        });
        it('should handle partial network information gracefully', async () => {
            const { ethers } = require('ethers');
            const mockNetwork = {
                name: 'unknown',
                chainId: 42
            };
            const getNetworkMock = jest.fn().mockResolvedValue(mockNetwork);
            ethers.JsonRpcProvider.mockImplementation(() => ({
                getNetwork: getNetworkMock
            }));
            const detectedInfo = await (0, network_utils_1.detectNetworkFromRpc)('http://custom-network:8545');
            const customNetwork = {
                name: detectedInfo.name || `custom-${detectedInfo.chainId}`,
                chainId: detectedInfo.chainId,
                rpcUrl: 'http://custom-network:8545',
                supports: detectedInfo.supports || [],
                gasLimit: detectedInfo.gasLimit,
                testnet: detectedInfo.testnet
            };
            expect(customNetwork).toEqual({
                name: 'unknown',
                chainId: 42,
                rpcUrl: 'http://custom-network:8545',
                supports: [],
                gasLimit: undefined,
                testnet: undefined
            });
        });
    });
});
//# sourceMappingURL=network-utils.spec.js.map