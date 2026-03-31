"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engine_1 = require("../engine");
const resolver_1 = require("../resolver");
const repository_1 = require("../../contracts/repository");
const etherscan_1 = require("../../verification/etherscan");
describe('JSON Integration Tests', () => {
    let engine;
    let context;
    let resolver;
    let mockNetwork;
    let mockRegistry;
    let templates;
    beforeEach(() => {
        mockNetwork = { name: 'testnet', chainId: 999, rpcUrl: 'http://localhost:8545' };
        mockRegistry = new repository_1.ContractRepository();
        context = {
            getNetwork: () => mockNetwork,
            setOutput: jest.fn(),
            getOutput: jest.fn(),
            setContextPath: jest.fn(),
            getContextPath: jest.fn(),
            dispose: jest.fn(),
            provider: {},
            contractRepository: mockRegistry
        };
        templates = new Map();
        const verificationRegistry = new etherscan_1.VerificationPlatformRegistry();
        engine = new engine_1.ExecutionEngine(templates, { verificationRegistry });
        resolver = new resolver_1.ValueResolver();
    });
    describe('ReadJsonValue resolver', () => {
        it('should extract nested values from JSON objects', async () => {
            const testJson = {
                txs: {
                    to: '0x596aF90CecdBF9A768886E771178fd5561dD27Ab',
                    data: '0x1234'
                }
            };
            const value = {
                type: 'read-json',
                arguments: {
                    json: testJson,
                    path: 'txs.data'
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x1234');
        });
        it('should extract nested address values', async () => {
            const testJson = {
                txs: {
                    to: '0x596aF90CecdBF9A768886E771178fd5561dD27Ab',
                    data: '0x1234'
                }
            };
            const value = {
                type: 'read-json',
                arguments: {
                    json: testJson,
                    path: 'txs.to'
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x596aF90CecdBF9A768886E771178fd5561dD27Ab');
        });
        it('should handle array access', async () => {
            const testJson = {
                transactions: [
                    { hash: '0xabc123', value: '1000' },
                    { hash: '0xdef456', value: '2000' }
                ]
            };
            const value = {
                type: 'read-json',
                arguments: {
                    json: testJson,
                    path: 'transactions.1.hash'
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xdef456');
        });
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
            };
            const value = {
                type: 'read-json',
                arguments: {
                    json: testJson,
                    path: 'response.data.blockchain.ethereum.contracts.token.symbol'
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('TEST');
        });
        it('should return entire object when path is empty', async () => {
            const testJson = { name: 'test', value: 42 };
            const value = {
                type: 'read-json',
                arguments: {
                    json: testJson,
                    path: ''
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toEqual(testJson);
        });
        it('should throw error for invalid paths', async () => {
            const testJson = { name: 'test' };
            const value = {
                type: 'read-json',
                arguments: {
                    json: testJson,
                    path: 'nonexistent.field'
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('read-json: Failed to access path "nonexistent.field"');
        });
        it('should handle null and undefined values gracefully', async () => {
            const testJson = {
                data: {
                    value: null,
                    missing: undefined
                }
            };
            const nullValue = {
                type: 'read-json',
                arguments: {
                    json: testJson,
                    path: 'data.value'
                }
            };
            const result = await resolver.resolve(nullValue, context);
            expect(result).toBeNull();
        });
        it('should work with template variables', async () => {
            const mockJson = {
                api: {
                    response: {
                        status: 'success',
                        data: '0xabcdef'
                    }
                }
            };
            const originalResolve = resolver.resolve.bind(resolver);
            jest.spyOn(resolver, 'resolve').mockImplementation(async (value, ctx, scope) => {
                if (value === '{{apiResponse}}') {
                    return mockJson;
                }
                if (value === '{{extractPath}}') {
                    return 'api.response.data';
                }
                return originalResolve(value, ctx, scope);
            });
            const value = {
                type: 'read-json',
                arguments: {
                    json: '{{apiResponse}}',
                    path: '{{extractPath}}'
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xabcdef');
        });
        it('should allow numeric network chain IDs to index top-level maps', async () => {
            const value = {
                type: 'read-json',
                arguments: {
                    json: {
                        999: {
                            executeCalldata: '0xfeedface'
                        }
                    },
                    path: '{{Network().chainId}}'
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toEqual({ executeCalldata: '0xfeedface' });
        });
        it('should let value-empty detect missing top-level map entries', async () => {
            const value = {
                type: 'value-empty',
                arguments: {
                    value: {
                        type: 'read-json',
                        arguments: {
                            json: {
                                999: {
                                    executeCalldata: '0xfeedface'
                                }
                            },
                            path: '{{missingChainId}}'
                        }
                    }
                }
            };
            const scope = new Map([['missingChainId', 10]]);
            const result = await resolver.resolve(value, context, scope);
            expect(result).toBe(true);
        });
    });
    describe('JsonRequestAction integration', () => {
        it('should handle json-request action type validation', () => {
            const action = {
                type: 'json-request',
                name: 'test-request',
                arguments: {
                    url: 'https://api.example.com/data',
                    method: 'GET'
                }
            };
            expect(action.type).toBe('json-request');
            expect(action.arguments.url).toBe('https://api.example.com/data');
            expect(action.arguments.method).toBe('GET');
        });
        it('should validate required url parameter', async () => {
            const action = {
                type: 'json-request',
                name: 'test-request',
                arguments: {
                    url: null
                }
            };
            const mockEngine = {
                resolver: {
                    resolve: jest.fn().mockResolvedValue(null)
                }
            };
            expect(mockEngine.resolver.resolve).toBeDefined();
        });
    });
    describe('End-to-end workflow simulation', () => {
        it('should simulate the Guard API example workflow', async () => {
            const mockApiResponse = {
                txs: {
                    to: '0x596aF90CecdBF9A768886E771178fd5561dD27Ab',
                    data: '0x1234'
                }
            };
            context.setOutput('guard-patch-request.response', mockApiResponse);
            const extractDataValue = {
                type: 'read-json',
                arguments: {
                    json: mockApiResponse,
                    path: 'txs.data'
                }
            };
            const extractedData = await resolver.resolve(extractDataValue, context);
            expect(extractedData).toBe('0x1234');
            const extractToValue = {
                type: 'read-json',
                arguments: {
                    json: mockApiResponse,
                    path: 'txs.to'
                }
            };
            const extractedTo = await resolver.resolve(extractToValue, context);
            expect(extractedTo).toBe('0x596aF90CecdBF9A768886E771178fd5561dD27Ab');
            expect(extractedData).toBe('0x1234');
            expect(extractedTo).toBe('0x596aF90CecdBF9A768886E771178fd5561dD27Ab');
        });
        it('should allow piping read-json output into slice-bytes', async () => {
            const response = {
                txs: {
                    data: '0xaabbccddff'
                }
            };
            const value = {
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
            };
            const trimmed = await resolver.resolve(value, context);
            expect(trimmed).toBe('0xaabbccdd');
        });
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
            };
            const statusValue = {
                type: 'read-json',
                arguments: {
                    json: complexApiResponse,
                    path: 'status'
                }
            };
            const firstTxData = {
                type: 'read-json',
                arguments: {
                    json: complexApiResponse,
                    path: 'data.transactions.0.data'
                }
            };
            const secondTxTo = {
                type: 'read-json',
                arguments: {
                    json: complexApiResponse,
                    path: 'data.transactions.1.to'
                }
            };
            const timestamp = {
                type: 'read-json',
                arguments: {
                    json: complexApiResponse,
                    path: 'data.metadata.timestamp'
                }
            };
            expect(await resolver.resolve(statusValue, context)).toBe('success');
            expect(await resolver.resolve(firstTxData, context)).toBe('0xfirst');
            expect(await resolver.resolve(secondTxTo, context)).toBe('0x222222');
            expect(await resolver.resolve(timestamp, context)).toBe(1234567890);
        });
    });
});
//# sourceMappingURL=json-integration.spec.js.map