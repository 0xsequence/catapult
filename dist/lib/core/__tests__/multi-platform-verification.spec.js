"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engine_1 = require("../engine");
const context_1 = require("../context");
const repository_1 = require("../../contracts/repository");
const etherscan_1 = require("../../verification/etherscan");
const mockFetch = jest.fn();
global.fetch = mockFetch;
jest.mock('fs/promises', () => ({
    readFile: jest.fn()
}));
const mockReadFile = require('fs/promises').readFile;
describe('Multi-Platform Verification Integration', () => {
    let engine;
    let context;
    let mockNetwork;
    let mockRegistry;
    let verificationRegistry;
    let mockEtherscanPlatform;
    let mockSourcifyPlatform;
    let templates;
    beforeEach(async () => {
        mockNetwork = {
            name: 'sepolia',
            chainId: 11155111,
            rpcUrl: 'https://sepolia.rpc.url'
        };
        mockRegistry = new repository_1.ContractRepository();
        const mockPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        context = new context_1.ExecutionContext(mockNetwork, mockPrivateKey, mockRegistry);
        mockEtherscanPlatform = {
            name: 'etherscan_v2',
            supportsNetwork: jest.fn().mockReturnValue(true),
            isConfigured: jest.fn().mockReturnValue(true),
            getConfigurationRequirements: jest.fn().mockReturnValue('Etherscan API key required'),
            isContractAlreadyVerified: jest.fn().mockResolvedValue(false),
            verifyContract: jest.fn().mockResolvedValue({
                success: true,
                message: 'Contract verified on Etherscan',
                guid: 'etherscan-guid'
            })
        };
        mockSourcifyPlatform = {
            name: 'sourcify',
            supportsNetwork: jest.fn().mockReturnValue(true),
            isConfigured: jest.fn().mockReturnValue(true),
            getConfigurationRequirements: jest.fn().mockReturnValue('Sourcify requires no configuration'),
            isContractAlreadyVerified: jest.fn().mockResolvedValue(false),
            verifyContract: jest.fn().mockResolvedValue({
                success: true,
                message: 'Contract verified on Sourcify'
            })
        };
        verificationRegistry = new etherscan_1.VerificationPlatformRegistry();
        verificationRegistry.register(mockEtherscanPlatform);
        verificationRegistry.register(mockSourcifyPlatform);
        templates = new Map();
        engine = new engine_1.ExecutionEngine(templates, { verificationRegistry });
        const mockContract = {
            uniqueHash: 'test-hash',
            creationCode: '0x608060405234801561001057600080fd5b50',
            sourceName: 'MyToken.sol',
            contractName: 'MyToken',
            buildInfoId: 'test-build-info',
            compiler: { version: '0.8.19' },
            _sources: new Set(['contracts/MyToken.sol', '/path/to/build-info/test.json'])
        };
        const mockBuildInfo = {
            _format: 'hh-sol-build-info-1',
            id: 'test-id',
            solcVersion: '0.8.19',
            solcLongVersion: '0.8.19+commit.7dd6d404',
            input: {
                language: 'Solidity',
                sources: {
                    'contracts/MyToken.sol': {
                        content: 'contract MyToken {}'
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
        };
        context.setOutput('deploy.address', '0x1234567890123456789012345678901234567890');
        context.setOutput('deploy.contract', mockContract);
        mockReadFile.mockResolvedValue(JSON.stringify(mockBuildInfo));
        jest.clearAllMocks();
        mockReadFile.mockResolvedValue(JSON.stringify(mockBuildInfo));
    });
    afterEach(async () => {
        if (context) {
            try {
                await context.dispose();
            }
            catch (error) {
            }
        }
    });
    describe('Platform Selection', () => {
        it('should verify on single specified platform', async () => {
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'etherscan_v2'
                        }
                    }
                ]
            };
            await engine.executeJob(job, context);
            expect(mockEtherscanPlatform.verifyContract).toHaveBeenCalled();
            expect(mockSourcifyPlatform.verifyContract).not.toHaveBeenCalled();
        });
        it('should verify on multiple specified platforms', async () => {
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify-etherscan',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'etherscan_v2'
                        }
                    },
                    {
                        type: 'verify-contract',
                        name: 'verify-sourcify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'sourcify'
                        }
                    }
                ]
            };
            await engine.executeJob(job, context);
            expect(mockEtherscanPlatform.verifyContract).toHaveBeenCalled();
            expect(mockSourcifyPlatform.verifyContract).toHaveBeenCalled();
        });
        it('should verify on all configured platforms when platform is "all"', async () => {
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'all'
                        }
                    }
                ]
            };
            await engine.executeJob(job, context);
            expect(mockEtherscanPlatform.verifyContract).toHaveBeenCalled();
            expect(mockSourcifyPlatform.verifyContract).toHaveBeenCalled();
        });
        it('should default to "all" when no platform is specified', async () => {
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}'
                        }
                    }
                ]
            };
            await engine.executeJob(job, context);
            expect(mockEtherscanPlatform.verifyContract).toHaveBeenCalled();
            expect(mockSourcifyPlatform.verifyContract).toHaveBeenCalled();
        });
    });
    describe('Error Handling', () => {
        it('should handle partial failures gracefully', async () => {
            mockEtherscanPlatform.verifyContract.mockResolvedValueOnce({
                success: false,
                message: 'Etherscan verification failed'
            });
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'etherscan_v2'
                        }
                    }
                ]
            };
            await expect(engine.executeJob(job, context)).rejects.toThrow('Verification failed');
        });
        it('should fail when all platforms fail', async () => {
            mockEtherscanPlatform.verifyContract.mockResolvedValueOnce({
                success: false,
                message: 'Etherscan verification failed'
            });
            mockSourcifyPlatform.verifyContract.mockResolvedValueOnce({
                success: false,
                message: 'Sourcify verification failed'
            });
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'etherscan_v2'
                        }
                    }
                ]
            };
            await expect(engine.executeJob(job, context)).rejects.toThrow('Verification failed');
        });
        it('should handle unsupported platform gracefully', async () => {
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'unsupported-platform'
                        }
                    }
                ]
            };
            await expect(engine.executeJob(job, context)).rejects.toThrow('Unsupported verification platform');
        });
        it('should skip unconfigured platforms', async () => {
            mockEtherscanPlatform.isConfigured.mockReturnValue(false);
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'etherscan_v2'
                        }
                    }
                ]
            };
            await engine.executeJob(job, context);
            expect(mockEtherscanPlatform.verifyContract).not.toHaveBeenCalled();
        });
    });
    describe('Backwards Compatibility', () => {
        it('should set guid output from first successful verification with guid', async () => {
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 'etherscan_v2'
                        }
                    }
                ]
            };
            await engine.executeJob(job, context);
            expect(context.getOutput('verify.verified')).toBe(true);
            expect(context.getOutput('verify.guid')).toBe('etherscan-guid');
        });
        it('should validate platform argument types', async () => {
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: 123
                        }
                    }
                ]
            };
            await expect(engine.executeJob(job, context)).rejects.toThrow('platform must be a string, array of strings, or \'all\'');
        });
        it('should validate array platform entries', async () => {
            const job = {
                name: 'test-verify-job',
                version: '1',
                actions: [
                    {
                        type: 'verify-contract',
                        name: 'verify',
                        arguments: {
                            address: '{{deploy.address}}',
                            contract: '{{deploy.contract}}',
                            platform: ['etherscan_v2', 123]
                        }
                    }
                ]
            };
            await expect(engine.executeJob(job, context)).rejects.toThrow('platform array must contain only strings');
        });
    });
});
//# sourceMappingURL=multi-platform-verification.spec.js.map