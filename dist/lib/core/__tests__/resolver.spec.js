"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const resolver_1 = require("../resolver");
const context_1 = require("../context");
const repository_1 = require("../../contracts/repository");
describe('ValueResolver', () => {
    let resolver;
    let context;
    let mockNetwork;
    let mockRegistry;
    beforeEach(async () => {
        resolver = new resolver_1.ValueResolver();
        mockRegistry = new repository_1.ContractRepository();
        const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
        mockNetwork = {
            name: 'testnet',
            chainId: 999,
            rpcUrl,
            supports: ["sourcify", "etherscan_v2"],
            gasLimit: 10000000,
            evmVersion: 'cancun',
        };
        const mockPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
        context = new context_1.ExecutionContext(mockNetwork, mockPrivateKey, mockRegistry);
        await context.provider.getNetwork();
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
    describe('basic-arithmetic', () => {
        it('should add two numbers', async () => {
            const value = {
                type: 'basic-arithmetic',
                arguments: { operation: 'add', values: ["100", "50"] },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('150');
        });
        it('should subtract two numbers', async () => {
            const value = {
                type: 'basic-arithmetic',
                arguments: { operation: 'sub', values: [100, 50] },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('50');
        });
        it('should multiply two numbers', async () => {
            const value = {
                type: 'basic-arithmetic',
                arguments: { operation: 'mul', values: [10, 5] },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('50');
        });
        it('should divide two numbers (integer division)', async () => {
            const value = {
                type: 'basic-arithmetic',
                arguments: { operation: 'div', values: [10, 3] },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('3');
        });
        it('should handle large numbers as strings', async () => {
            const value = {
                type: 'basic-arithmetic',
                arguments: { operation: 'add', values: ['10000000000000000000', '5000000000000000000'] },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('15000000000000000000');
        });
        it('should correctly evaluate "eq" (equal)', async () => {
            const valueTrue = { type: 'basic-arithmetic', arguments: { operation: 'eq', values: [10, 10] } };
            const valueFalse = { type: 'basic-arithmetic', arguments: { operation: 'eq', values: [10, 5] } };
            expect(await resolver.resolve(valueTrue, context)).toBe(true);
            expect(await resolver.resolve(valueFalse, context)).toBe(false);
        });
        it('should correctly evaluate "neq" (not equal)', async () => {
            const valueTrue = { type: 'basic-arithmetic', arguments: { operation: 'neq', values: [10, 5] } };
            const valueFalse = { type: 'basic-arithmetic', arguments: { operation: 'neq', values: [10, 10] } };
            expect(await resolver.resolve(valueTrue, context)).toBe(true);
            expect(await resolver.resolve(valueFalse, context)).toBe(false);
        });
        it('should treat nullish nested values as non-equal without throwing', async () => {
            const value = {
                type: 'basic-arithmetic',
                arguments: {
                    operation: 'eq',
                    values: [
                        {
                            type: 'call',
                            arguments: {
                                to: '0x1234567890123456789012345678901234567890',
                                signature: 'imageHash() returns (bytes32)',
                                values: [],
                            },
                        },
                        '0xfd72d46fd0d0a98780315f81790f051356f2f3101af4b5c3fb1c6da3237fb765',
                    ],
                },
            };
            await expect(resolver.resolve(value, context)).resolves.toBe(false);
        });
        it('should correctly evaluate "gt" (greater than)', async () => {
            const valueTrue = { type: 'basic-arithmetic', arguments: { operation: 'gt', values: [10, 5] } };
            const valueFalse = { type: 'basic-arithmetic', arguments: { operation: 'gt', values: [10, 10] } };
            expect(await resolver.resolve(valueTrue, context)).toBe(true);
            expect(await resolver.resolve(valueFalse, context)).toBe(false);
        });
        it('should correctly evaluate "gte" (greater than or equal)', async () => {
            const valueTrue1 = { type: 'basic-arithmetic', arguments: { operation: 'gte', values: [10, 5] } };
            const valueTrue2 = { type: 'basic-arithmetic', arguments: { operation: 'gte', values: [10, 10] } };
            const valueFalse = { type: 'basic-arithmetic', arguments: { operation: 'gte', values: [5, 10] } };
            expect(await resolver.resolve(valueTrue1, context)).toBe(true);
            expect(await resolver.resolve(valueTrue2, context)).toBe(true);
            expect(await resolver.resolve(valueFalse, context)).toBe(false);
        });
        it('should correctly evaluate "lt" (less than)', async () => {
            const valueTrue = { type: 'basic-arithmetic', arguments: { operation: 'lt', values: [5, 10] } };
            const valueFalse = { type: 'basic-arithmetic', arguments: { operation: 'lt', values: [10, 10] } };
            expect(await resolver.resolve(valueTrue, context)).toBe(true);
            expect(await resolver.resolve(valueFalse, context)).toBe(false);
        });
        it('should correctly evaluate "lte" (less than or equal)', async () => {
            const valueTrue1 = { type: 'basic-arithmetic', arguments: { operation: 'lte', values: [5, 10] } };
            const valueTrue2 = { type: 'basic-arithmetic', arguments: { operation: 'lte', values: [10, 10] } };
            const valueFalse = { type: 'basic-arithmetic', arguments: { operation: 'lte', values: [10, 5] } };
            expect(await resolver.resolve(valueTrue1, context)).toBe(true);
            expect(await resolver.resolve(valueTrue2, context)).toBe(true);
            expect(await resolver.resolve(valueFalse, context)).toBe(false);
        });
        it('should resolve nested values before performing the operation', async () => {
            context.setOutput('fee', '10000000000000000');
            const value = {
                type: 'basic-arithmetic',
                arguments: { operation: 'add', values: ['{{fee}}', '5000000000000000'] },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('15000000000000000');
        });
    });
    describe('read-balance', () => {
        const testAddress = '0x1234567890123456789012345678901234567890';
        const testAddress2 = '0x0987654321098765432109876543210987654321';
        let anvilProvider;
        beforeEach(async () => {
            anvilProvider = context.provider;
            await anvilProvider.send('anvil_setBalance', [testAddress, '0x0']);
            await anvilProvider.send('anvil_setBalance', [testAddress2, '0x0']);
        });
        it('should read balance for an address with 0 ETH', async () => {
            const value = {
                type: 'read-balance',
                arguments: { address: testAddress },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0');
        });
        it('should read balance for an address with 1 ETH', async () => {
            await anvilProvider.send('anvil_setBalance', [testAddress, '0xde0b6b3a7640000']);
            const value = {
                type: 'read-balance',
                arguments: { address: testAddress },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('1000000000000000000');
        });
        it('should read balance for an address with 100 ETH', async () => {
            await anvilProvider.send('anvil_setBalance', [testAddress, '0x56bc75e2d63100000']);
            const value = {
                type: 'read-balance',
                arguments: { address: testAddress },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('100000000000000000000');
        });
        it('should read balance for an address with custom amount', async () => {
            await anvilProvider.send('anvil_setBalance', [testAddress, '0xab524017e8328000']);
            const value = {
                type: 'read-balance',
                arguments: { address: testAddress },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('12345000000000000000');
        });
        it('should read different balances for different addresses', async () => {
            await anvilProvider.send('anvil_setBalance', [testAddress, '0xde0b6b3a7640000']);
            await anvilProvider.send('anvil_setBalance', [testAddress2, '0x1bc16d674ec80000']);
            const value1 = {
                type: 'read-balance',
                arguments: { address: testAddress },
            };
            const value2 = {
                type: 'read-balance',
                arguments: { address: testAddress2 },
            };
            const result1 = await resolver.resolve(value1, context);
            const result2 = await resolver.resolve(value2, context);
            expect(result1).toBe('1000000000000000000');
            expect(result2).toBe('2000000000000000000');
        });
        it('should resolve address from context variable', async () => {
            context.setOutput('myAddress', testAddress);
            await anvilProvider.send('anvil_setBalance', [testAddress, '0xde0b6b3a7640000']);
            const value = {
                type: 'read-balance',
                arguments: { address: '{{myAddress}}' },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('1000000000000000000');
        });
        it('should throw error for invalid address', async () => {
            const value = {
                type: 'read-balance',
                arguments: { address: 'invalid-address' },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid address: invalid-address');
        });
        it('should throw error for null address', async () => {
            const value = {
                type: 'read-balance',
                arguments: { address: null },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid address: null');
        });
        it('should throw error for undefined address', async () => {
            const value = {
                type: 'read-balance',
                arguments: { address: undefined },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid address: undefined');
        });
        it('should handle very large balance amounts', async () => {
            await anvilProvider.send('anvil_setBalance', [testAddress, '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff']);
            const value = {
                type: 'read-balance',
                arguments: { address: testAddress },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('115792089237316195423570985008687907853269984665640564039457584007913129639935');
        });
        it('should handle checksummed addresses', async () => {
            const checksummedAddress = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
            await anvilProvider.send('anvil_setBalance', [checksummedAddress, '0xde0b6b3a7640000']);
            const value = {
                type: 'read-balance',
                arguments: { address: checksummedAddress },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('1000000000000000000');
        });
        it('should handle lowercase addresses', async () => {
            const lowercaseAddress = testAddress.toLowerCase();
            await anvilProvider.send('anvil_setBalance', [lowercaseAddress, '0xde0b6b3a7640000']);
            const value = {
                type: 'read-balance',
                arguments: { address: lowercaseAddress },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('1000000000000000000');
        });
    });
    describe('compute-create2', () => {
        it('should compute CREATE2 address with hardcoded test case 1', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: '0x00',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38');
        });
        it('should compute CREATE2 address with hardcoded test case 2', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0xdeadbeef00000000000000000000000000000000',
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: '0x00',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xB928f69Bb1D91Cd65274e3c79d8986362984fDA3');
        });
        it('should compute CREATE2 address with hardcoded test case 3', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0xdeadbeef00000000000000000000000000000000',
                    salt: '0x000000000000000000000000feed000000000000000000000000000000000000',
                    initCode: '0x00',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xD04116cDd17beBE565EB2422F2497E06cC1C9833');
        });
        it('should compute CREATE2 address with hardcoded test case 4', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: '0xdeadbeef',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x70f2b2914A2a4b783FaEFb75f459A580616Fcb5e');
        });
        it('should compute CREATE2 address with hardcoded test case 5', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x00000000000000000000000000000000deadbeef',
                    salt: '0x00000000000000000000000000000000000000000000000000000000cafebabe',
                    initCode: '0xdeadbeef',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x60f3f640a8508fC6a86d45DF051962668E1e8AC7');
        });
        it('should compute CREATE2 address with hardcoded test case 6', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x00000000000000000000000000000000deadbeef',
                    salt: '0x00000000000000000000000000000000000000000000000000000000cafebabe',
                    initCode: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x1d8bfDC5D46DC4f61D6b6115972536eBE6A8854C');
        });
        it('should compute CREATE2 address with hardcoded test case 7 (empty initCode)', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: '0x',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xE33C0C7F7df4809055C3ebA6c09CFe4BaF1BD9e0');
        });
        it('should resolve values from context before computing CREATE2 address', async () => {
            context.setOutput('myDeployer', '0x0000000000000000000000000000000000000000');
            context.setOutput('mySalt', '0x0000000000000000000000000000000000000000000000000000000000000000');
            context.setOutput('myInitCode', '0x00');
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '{{myDeployer}}',
                    salt: '{{mySalt}}',
                    initCode: '{{myInitCode}}',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38');
        });
        it('should throw error for invalid deployer address', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: 'invalid-address',
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: '0x00',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid deployer address: invalid-address');
        });
        it('should throw error for invalid salt', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    salt: 'invalid-salt',
                    initCode: '0x00',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid salt: invalid-salt');
        });
        it('should throw error for invalid init code', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: 'invalid-init-code',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid init code: invalid-init-code');
        });
        it('should throw error for null deployer address', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: null,
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: '0x00',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid deployer address: null');
        });
        it('should throw error for undefined salt', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    salt: undefined,
                    initCode: '0x00',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid salt: undefined');
        });
        it('should handle checksummed addresses', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0xdEADBEeF00000000000000000000000000000000',
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: '0x00',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xB928f69Bb1D91Cd65274e3c79d8986362984fDA3');
        });
        it('should handle uppercase hex strings', async () => {
            const value = {
                type: 'compute-create2',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
                    initCode: '0xDEADBEEF',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x70f2b2914A2a4b783FaEFb75f459A580616Fcb5e');
        });
    });
    describe('compute-create', () => {
        it('should compute CREATE address with hardcoded test case 1', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    nonce: '0',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xBd770416a3345F91E4B34576cb804a576fa48EB1');
        });
        it('should compute CREATE address with hardcoded test case 2', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0xC6064FfBaDB0687Da29721C8EC02ACa71e735a3e',
                    nonce: '1',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x6d2E686984620c01Af3cd125F9E1A2E23a972FFc');
        });
        it('should compute CREATE address with hardcoded test case 3', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0xC6064FfBaDB0687Da29721C8EC02ACa71e735a3e',
                    nonce: '2',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xBA6CfaFc33eD8229D2Af9a5a7BC22e8834cE0873');
        });
        it('should compute CREATE address with hardcoded test case ERC-2470', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0xBb6e024b9cFFACB947A71991E386681B1Cd1477D',
                    nonce: '0',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xce0042B868300000d44A59004Da54A005ffdcf9f');
        });
        it('should compute CREATE address with hardcoded test case Universal Deployer', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0x9c5a87452d4FAC0cbd53BDCA580b20A45526B3AB',
                    nonce: '0',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x1B926fBB24A9F78DCDd3272f2d86F5D0660E59c0');
        });
        it('should resolve values from context before computing CREATE address', async () => {
            context.setOutput('myDeployer', '0x0000000000000000000000000000000000000000');
            context.setOutput('myNonce', '0');
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '{{myDeployer}}',
                    nonce: '{{myNonce}}',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xBd770416a3345F91E4B34576cb804a576fa48EB1');
        });
        it('should throw error for invalid deployer address', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: 'invalid-address',
                    nonce: '0',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid deployer address: invalid-address');
        });
        it('should throw error for invalid nonce', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    nonce: 'invalid-nonce',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid nonce: invalid-nonce');
        });
        it('should throw error for null deployer address', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: null,
                    nonce: '0',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid deployer address: null');
        });
        it('should throw error for undefined nonce', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    nonce: undefined,
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid nonce: undefined');
        });
        it('should handle checksummed addresses', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0xdEADBEeF00000000000000000000000000000000',
                    nonce: '0',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xf2048C36a5536FeA3Bc71d49ed59f2c65C546EEA');
        });
        it('should handle number nonce', async () => {
            const value = {
                type: 'compute-create',
                arguments: {
                    deployerAddress: '0x0000000000000000000000000000000000000000',
                    nonce: 69420,
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x7Bd7F19787DA009bD75b849c92Db10CE11916487');
        });
    });
    describe('constructor-encode', () => {
        it('should encode creation code with no constructor arguments', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    creationCode: '0x608060405234801561001057600080fd5b50',
                    types: [],
                    values: []
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x608060405234801561001057600080fd5b50');
        });
        it('should encode creation code with a single address argument', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    creationCode: '0x608060405234801561001057600080fd5b50',
                    types: ['address'],
                    values: ['0x1234567890123456789012345678901234567890']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x608060405234801561001057600080fd5b500000000000000000000000001234567890123456789012345678901234567890');
        });
        it('should encode creation code with multiple arguments', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    creationCode: '0x608060405234801561001057600080fd5b50',
                    types: ['address', 'uint256'],
                    values: ['0x1234567890123456789012345678901234567890', '42']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x608060405234801561001057600080fd5b50')).toBe(true);
            expect(result.length).toBeGreaterThan('0x608060405234801561001057600080fd5b50'.length);
        });
        it('should validate that types and values arrays have same length', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    creationCode: '0x608060405234801561001057600080fd5b50',
                    types: ['address'],
                    values: ['0x1234567890123456789012345678901234567890', '42']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('constructor-encode: types array length (1) must match values array length (2)');
        });
        it('should validate creation code is valid bytecode', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    creationCode: 'not-valid-bytecode',
                    types: [],
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid creation code: not-valid-bytecode');
        });
        it('should encode just constructor arguments when no creationCode provided', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    types: ['address'],
                    values: ['0x1234567890123456789012345678901234567890']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x0000000000000000000000001234567890123456789012345678901234567890');
        });
        it('should encode multiple constructor arguments when no creationCode provided', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    types: ['address', 'uint256'],
                    values: ['0x1234567890123456789012345678901234567890', '42']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x')).toBe(true);
            expect(result).toBe('0x0000000000000000000000001234567890123456789012345678901234567890000000000000000000000000000000000000000000000000000000000000002a');
        });
        it('should return 0x when no creationCode and no constructor arguments', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    types: [],
                    values: []
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x');
        });
        it('should validate that types and values arrays have same length when no creationCode', async () => {
            const value = {
                type: 'constructor-encode',
                arguments: {
                    types: ['address'],
                    values: ['0x1234567890123456789012345678901234567890', '42']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('constructor-encode: types array length (1) must match values array length (2)');
        });
    });
    describe('abi-encode', () => {
        it('should encode a simple function with no parameters', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'withdraw()',
                    values: []
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x3ccfd60b');
        });
        it('should encode a function with a single address parameter', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'transfer(address)',
                    values: ['0x1234567890123456789012345678901234567890']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x1a695230')).toBe(true);
            expect(result.length).toBe(74);
        });
        it('should encode a function with multiple parameters', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'transfer(address,uint256)',
                    values: ['0x1234567890123456789012345678901234567890', '1000000000000000000']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0xa9059cbb')).toBe(true);
            expect(result.length).toBe(138);
        });
        it('should encode a function with various parameter types', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'complexFunction(address,uint256,bool,string)',
                    values: [
                        '0x1234567890123456789012345678901234567890',
                        '42',
                        true,
                        'hello world'
                    ]
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x')).toBe(true);
            expect(result.length % 2).toBe(0);
            expect(result.length).toBeGreaterThan(10);
        });
        it('should handle string parameters correctly', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'setName(string)',
                    values: ['Alice']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x')).toBe(true);
            const iface = new ethers_1.ethers.Interface(['function setName(string)']);
            const decoded = iface.decodeFunctionData('setName', result);
            expect(decoded[0]).toBe('Alice');
        });
        it('should handle array parameters', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'batchTransfer(address[])',
                    values: [['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321']]
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x')).toBe(true);
            const iface = new ethers_1.ethers.Interface(['function batchTransfer(address[])']);
            const decoded = iface.decodeFunctionData('batchTransfer', result);
            expect(decoded[0]).toEqual(['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321']);
        });
        it('should validate that signature is provided', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: null,
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('abi-encode: signature is required');
        });
        it('should validate that values array is provided', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'transfer(address)',
                    values: null
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('abi-encode: values array is required');
        });
        it('should handle invalid function signatures gracefully', async () => {
            const originalConsoleLog = console.log;
            console.log = jest.fn();
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'invalid signature format',
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/abi-encode: Failed to encode function data:/);
            console.log = originalConsoleLog;
        });
        it('should handle mismatched parameter count', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'transfer(address,uint256)',
                    values: ['0x1234567890123456789012345678901234567890']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/abi-encode: Failed to encode function data:/);
        });
        it('should handle type mismatches gracefully', async () => {
            const value = {
                type: 'abi-encode',
                arguments: {
                    signature: 'transfer(address,uint256)',
                    values: ['not-an-address', 'not-a-number']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/abi-encode: Failed to encode function data:/);
        });
    });
    describe('abi-pack', () => {
        it('should pack a single uint256 value', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint256'],
                    values: ['42']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x000000000000000000000000000000000000000000000000000000000000002a');
        });
        it('should pack multiple values with different types', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint256', 'uint8', 'address'],
                    values: ['42', '255', '0x1234567890123456789012345678901234567890']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x')).toBe(true);
            expect(result.length).toBeGreaterThan(2);
        });
        it('should pack string values correctly', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['string'],
                    values: ['hello']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x')).toBe(true);
            expect(result).toBe('0x68656c6c6f');
        });
        it('should pack bytes values correctly', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['bytes'],
                    values: ['0xdeadbeef']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xdeadbeef');
        });
        it('should pack uint8 values without padding', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint8', 'uint8'],
                    values: ['255', '128']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xff80');
        });
        it('should pack address values correctly', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['address'],
                    values: ['0x1234567890123456789012345678901234567890']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x1234567890123456789012345678901234567890');
        });
        it('should pack boolean values correctly', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['bool', 'bool'],
                    values: [true, false]
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x0100');
        });
        it('should pack mixed types in correct order', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint8', 'address', 'uint8'],
                    values: ['42', '0x1234567890123456789012345678901234567890', '255']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.length).toBe(46);
            expect(result.startsWith('0x2a')).toBe(true);
            expect(result.endsWith('ff')).toBe(true);
        });
        it('should resolve values from context before packing', async () => {
            context.setOutput('myValue', '100');
            context.setOutput('myAddress', '0x1234567890123456789012345678901234567890');
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint256', 'address'],
                    values: ['{{myValue}}', '{{myAddress}}']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result.startsWith('0x')).toBe(true);
            expect(result.length).toBeGreaterThan(2);
        });
        it('should validate that types array is provided', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: null,
                    values: ['42']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('abi-pack: types array is required');
        });
        it('should validate that values array is provided', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint256'],
                    values: null
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('abi-pack: values array is required');
        });
        it('should validate that types and values arrays have same length', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint256', 'uint8'],
                    values: ['42']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('abi-pack: types array length (2) must match values array length (1)');
        });
        it('should validate that all types are strings', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint256', 123],
                    values: ['42', '255']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('abi-pack: all types must be strings');
        });
        it('should handle invalid type gracefully', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['invalidType'],
                    values: ['42']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/abi-pack: Failed to pack values:/);
        });
        it('should handle type mismatches gracefully', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint256'],
                    values: ['not-a-number']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/abi-pack: Failed to pack values:/);
        });
        it('should handle empty arrays', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: [],
                    values: []
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x');
        });
        it('should pack large numbers correctly', async () => {
            const value = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint256'],
                    values: ['115792089237316195423570985008687907853269984665640564039457584007913129639935']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
        });
        it('should demonstrate difference from abi-encode', async () => {
            const packValue = {
                type: 'abi-pack',
                arguments: {
                    types: ['uint8', 'uint8'],
                    values: ['42', '255']
                }
            };
            const encodeValue = {
                type: 'abi-encode',
                arguments: {
                    signature: 'test(uint8,uint8)',
                    values: ['42', '255']
                }
            };
            const packResult = await resolver.resolve(packValue, context);
            const encodeResult = await resolver.resolve(encodeValue, context);
            expect(packResult).toBe('0x2aff');
            expect(encodeResult.length).toBeGreaterThan(packResult.length);
        });
    });
    describe('contract artifact function expressions', () => {
        beforeEach(() => {
            const testArtifact1 = {
                contractName: 'TestContract',
                abi: [{ "type": "function", "name": "test", "inputs": [], "outputs": [{ "type": "uint256" }] }],
                bytecode: '0x608060405234801561000f575f5ffd5b50602a5f526020601ff3',
                _path: '/test/TestContract.json',
                _hash: 'abc123'
            };
            const testArtifact2 = {
                contractName: 'ContractWithoutBytecode',
                abi: [{ "type": "function", "name": "example", "inputs": [], "outputs": [] }],
                bytecode: '',
                _path: '/test/ContractWithoutBytecode.json',
                _hash: 'def456'
            };
            const testArtifact3 = {
                contractName: 'ContractWithoutABI',
                abi: [],
                bytecode: '0x608060405234801561000f575f5ffd5b50602a5f526020601ff4',
                _path: '/test/ContractWithoutABI.json',
                _hash: 'ghi789'
            };
            mockRegistry.addForTesting(testArtifact1);
            mockRegistry.addForTesting(testArtifact2);
            mockRegistry.addForTesting(testArtifact3);
        });
        describe('Contract(...).creationCode', () => {
            it('should return bytecode for valid artifact', async () => {
                const result = await resolver.resolve('{{Contract(TestContract).creationCode}}', context);
                expect(result).toBe('0x608060405234801561000f575f5ffd5b50602a5f526020601ff3');
            });
            it('should return bytecode for valid artifact using initCode alias', async () => {
                const result = await resolver.resolve('{{Contract(TestContract).creationCode}}', context);
                expect(result).toBe('0x608060405234801561000f575f5ffd5b50602a5f526020601ff3');
            });
            it('should resolve nested in value resolver objects', async () => {
                const value = {
                    type: 'constructor-encode',
                    arguments: {
                        creationCode: '{{Contract(TestContract).creationCode}}',
                        types: [],
                        values: []
                    }
                };
                const result = await resolver.resolve(value, context);
                expect(result).toBe('0x608060405234801561000f575f5ffd5b50602a5f526020601ff3');
            });
            it('should throw error for non-existent artifact', async () => {
                await expect(resolver.resolve('{{Contract(NonExistent).creationCode}}', context))
                    .rejects.toThrow('Artifact not found for reference: "NonExistent"');
            });
            it('should throw error for artifact missing bytecode', async () => {
                const artifactWithoutBytecode = {
                    contractName: 'ContractWithoutBytecode',
                    abi: [],
                    bytecode: '',
                    _path: '/test/ContractWithoutBytecode.json',
                    _hash: 'empty123'
                };
                mockRegistry.addForTesting(artifactWithoutBytecode);
                const contract = mockRegistry.lookup('ContractWithoutBytecode');
                expect(contract?.creationCode).toBe('');
                const result = await resolver.resolve('{{Contract(ContractWithoutBytecode).creationCode}}', context);
                expect(result).toBe('');
            });
            it('should handle artifacts with null bytecode', async () => {
                const artifactWithNullBytecode = {
                    contractName: 'NullBytecodeContract',
                    abi: [],
                    bytecode: null,
                    _path: '/test/NullBytecodeContract.json',
                    _hash: 'null123'
                };
                expect(() => mockRegistry.addForTesting(artifactWithNullBytecode))
                    .toThrow('Cannot hydrate contract from /test/NullBytecodeContract.json: missing creation code');
            });
            it('should handle artifacts with undefined bytecode', async () => {
                const artifactWithUndefinedBytecode = {
                    contractName: 'UndefinedBytecodeContract',
                    abi: [],
                    bytecode: undefined,
                    _path: '/test/UndefinedBytecodeContract.json',
                    _hash: 'undef123'
                };
                expect(() => mockRegistry.addForTesting(artifactWithUndefinedBytecode))
                    .toThrow('Cannot hydrate contract from /test/UndefinedBytecodeContract.json: missing creation code');
            });
        });
        describe('Contract(...).abi', () => {
            it('should return abi for valid artifact', async () => {
                const result = await resolver.resolve('{{Contract(TestContract).abi}}', context);
                expect(result).toEqual([{ "type": "function", "name": "test", "inputs": [], "outputs": [{ "type": "uint256" }] }]);
            });
            it('should resolve nested in value resolver objects', async () => {
                const abiValue = await resolver.resolve('{{Contract(TestContract).abi}}', context);
                context.setOutput('contractAbi', abiValue);
                const resolvedAbi = await resolver.resolve('{{contractAbi}}', context);
                expect(resolvedAbi).toEqual([{ "type": "function", "name": "test", "inputs": [], "outputs": [{ "type": "uint256" }] }]);
            });
            it('should throw error for non-existent artifact', async () => {
                await expect(resolver.resolve('{{Contract(NonExistent).abi}}', context))
                    .rejects.toThrow('Artifact not found for reference: "NonExistent"');
            });
            it('should return empty abi for artifact with empty abi array', async () => {
                const result = await resolver.resolve('{{Contract(ContractWithoutABI).abi}}', context);
                expect(result).toEqual([]);
            });
            it('should handle artifacts with null abi', async () => {
                const artifactWithNullAbi = {
                    contractName: 'NullAbiContract',
                    abi: null,
                    bytecode: '0x123',
                    _path: '/test/NullAbiContract.json',
                    _hash: 'nullabi123'
                };
                mockRegistry.addForTesting(artifactWithNullAbi);
                await expect(resolver.resolve('{{Contract(NullAbiContract).abi}}', context))
                    .rejects.toThrow('Property "abi" does not exist on contract found for reference "NullAbiContract"');
            });
            it('should handle artifacts with undefined abi', async () => {
                const artifactWithUndefinedAbi = {
                    contractName: 'UndefinedAbiContract',
                    abi: undefined,
                    bytecode: '0x123',
                    _path: '/test/UndefinedAbiContract.json',
                    _hash: 'undefabi123'
                };
                mockRegistry.addForTesting(artifactWithUndefinedAbi);
                await expect(resolver.resolve('{{Contract(UndefinedAbiContract).abi}}', context))
                    .rejects.toThrow('Property "abi" does not exist on contract found for reference "UndefinedAbiContract"');
            });
        });
        describe('Contract(...).buildInfoId', () => {
            it('should return buildInfoId for contract hydrated from build-info file', async () => {
                const buildInfoArtifact = {
                    contractName: 'TestBuildInfoContract',
                    abi: [{ "type": "function", "name": "test", "inputs": [], "outputs": [{ "type": "uint256" }] }],
                    bytecode: '0x608060405234801561000f575f5ffd5b50602a5f526020601ff3',
                    sourceName: 'src/TestContract.sol',
                    compiler: { name: 'solc', version: '0.8.19' },
                    buildInfoId: 'src/TestContract.sol:TestContract',
                    _path: '/test/build-info/test.json',
                    _hash: 'buildinfo123'
                };
                mockRegistry.addForTesting(buildInfoArtifact);
                const result = await resolver.resolve('{{Contract(TestBuildInfoContract).buildInfoId}}', context);
                expect(result).toBe('src/TestContract.sol:TestContract');
            });
            it('should throw error for non-existent artifact', async () => {
                await expect(resolver.resolve('{{Contract(NonExistent).buildInfoId}}', context))
                    .rejects.toThrow('Artifact not found for reference: "NonExistent"');
            });
            it('should throw error for contract that was not hydrated from build-info file', async () => {
                await expect(resolver.resolve('{{Contract(TestContract).buildInfoId}}', context))
                    .rejects.toThrow('Property "buildInfoId" does not exist on contract found for reference "TestContract"');
            });
        });
        describe('invalid Contract expressions', () => {
            it('should throw error for unknown function names', async () => {
                await expect(resolver.resolve('{{unknownFunction(TestContract)}}', context))
                    .rejects.toThrow('Failed to resolve expression "{{unknownFunction(TestContract)}}"');
            });
            it('should throw error for malformed expressions', async () => {
                await expect(resolver.resolve('{{creationCode}}', context))
                    .rejects.toThrow('Failed to resolve expression "{{creationCode}}"');
            });
            it('should throw error for invalid syntax', async () => {
                await expect(resolver.resolve('{{creationCode TestContract}}', context))
                    .rejects.toThrow('Failed to resolve expression "{{creationCode TestContract}}"');
            });
            it('should throw error for empty function calls', async () => {
                await expect(resolver.resolve('{{Contract().creationCode}}', context)).rejects.toThrow('Artifact not found for reference: ""');
            });
            it('should throw error for function calls with whitespace only', async () => {
                await expect(resolver.resolve('{{Contract(   ).creationCode}}', context)).rejects.toThrow('Artifact not found for reference: ""');
            });
            it('should handle function calls with extra whitespace in argument', async () => {
                const result = await resolver.resolve('{{Contract(  TestContract  ).creationCode}}', context);
                expect(result).toBe('0x608060405234801561000f575f5ffd5b50602a5f526020601ff3');
            });
            it('should handle mixed case function names correctly', async () => {
                await expect(resolver.resolve('{{CreationCode(TestContract)}}', context))
                    .rejects.toThrow('Failed to resolve expression "{{CreationCode(TestContract)}}"');
            });
            it('should handle function calls with multiple arguments (should fail)', async () => {
                await expect(resolver.resolve('{{Contract(TestContract, ExtraArg).creationCode}}', context))
                    .rejects.toThrow('Artifact not found for reference: "TestContract, ExtraArg"');
            });
        });
        describe('edge cases', () => {
            it('should handle artifacts identified by contract name', async () => {
                const pathArtifact = {
                    contractName: 'PathContract',
                    abi: [],
                    bytecode: '0xabcdef',
                    _path: '/very/long/path/to/contracts/PathContract.json',
                    _hash: 'path123'
                };
                mockRegistry.addForTesting(pathArtifact);
                const result = await resolver.resolve('{{Contract(PathContract).creationCode}}', context);
                expect(result).toBe('0xabcdef');
            });
            it('should handle artifacts with special characters in names', async () => {
                const specialArtifact = {
                    contractName: 'Special-Contract_v2',
                    abi: [],
                    bytecode: '0xspecial',
                    _path: '/test/Special-Contract_v2.json',
                    _hash: 'special123'
                };
                mockRegistry.addForTesting(specialArtifact);
                const result = await resolver.resolve('{{Contract(Special-Contract_v2).creationCode}}', context);
                expect(result).toBe('0xspecial');
            });
            it('should be case sensitive for artifact names', async () => {
                await expect(resolver.resolve('{{Contract(testcontract).creationCode}}', context))
                    .rejects.toThrow('Artifact not found for reference: "testcontract"');
            });
            it('should handle resolution with context variables for artifact names', async () => {
                context.setOutput('contractName', 'TestContract');
                const contractName = await resolver.resolve('{{contractName}}', context);
                const result = await resolver.resolve(`{{Contract(${contractName}).creationCode}}`, context);
                expect(result).toBe('0x608060405234801561000f575f5ffd5b50602a5f526020601ff3');
            });
        });
    });
    describe('network function expressions', () => {
        describe('Network().property', () => {
            it('should return name for valid network', async () => {
                const result = await resolver.resolve('{{Network().name}}', context);
                expect(result).toBe(mockNetwork.name);
            });
            it('should return handle whitespace after expression', async () => {
                const result = await resolver.resolve('{{Network().name }}', context);
                expect(result).toBe(mockNetwork.name);
            });
            it('should return handle whitespace before expression', async () => {
                const result = await resolver.resolve('{{ Network().name}}', context);
                expect(result).toBe(mockNetwork.name);
            });
            it('should return handle whitespace around expression', async () => {
                const result = await resolver.resolve('{{ Network().name }}', context);
                expect(result).toBe(mockNetwork.name);
            });
            it('should return chainId for valid network', async () => {
                const result = await resolver.resolve('{{Network().chainId}}', context);
                expect(result).toBe(mockNetwork.chainId);
            });
            it('should return rpcUrl for valid network', async () => {
                const result = await resolver.resolve('{{Network().rpcUrl}}', context);
                expect(result).toBe(mockNetwork.rpcUrl);
            });
            it('should return supports for valid network', async () => {
                const result = await resolver.resolve('{{Network().supports}}', context);
                expect(result).toBe(mockNetwork.supports);
            });
            it('should return gasLimit for valid network', async () => {
                const result = await resolver.resolve('{{Network().gasLimit}}', context);
                expect(result).toBe(mockNetwork.gasLimit);
            });
            it('should return testnet for valid network', async () => {
                const result = await resolver.resolve('{{Network().testnet}}', context);
                expect(result).toBe(false);
            });
            it('should return evmVersion for valid network', async () => {
                const result = await resolver.resolve('{{Network().evmVersion}}', context);
                expect(result).toBe(mockNetwork.evmVersion);
            });
        });
        describe('invalid Network expressions', () => {
            it('should fail for invalid property', async () => {
                await expect(resolver.resolve('{{Network().invalid}}', context))
                    .rejects.toThrow('Property "invalid" does not exist on network');
            });
            it('should fail for undefined property', async () => {
                await expect(resolver.resolve('{{Network().undefined}}', context))
                    .rejects.toThrow('Property "undefined" does not exist on network');
            });
            it('should fail for network with reference', async () => {
                await expect(resolver.resolve('{{Network(testnet).name}}', context))
                    .rejects.toThrow('Failed to resolve expression \"{{Network(testnet).name}}\". It is not a valid Contract(...) or Network() reference, local scope variable, constant, or a known output.');
            });
        });
    });
    describe('call', () => {
        let testContractAddress;
        let anvilProvider;
        beforeEach(async () => {
            anvilProvider = context.provider;
            testContractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
            const miniContractBytecode = '0x608060405234801561000f575f5ffd5b5060043610610034575f3560e01c80636df5b97a14610038578063f8a8fd6d14610068575b5f5ffd5b610052600480360381019061004d91906100da565b610086565b60405161005f9190610127565b60405180910390f35b61007061009b565b60405161007d9190610127565b60405180910390f35b5f8183610093919061016d565b905092915050565b5f602a905090565b5f5ffd5b5f819050919050565b6100b9816100a7565b81146100c3575f5ffd5b50565b5f813590506100d4816100b0565b92915050565b5f5f604083850312156100f0576100ef6100a3565b5b5f6100fd858286016100c6565b925050602061010e858286016100c6565b9150509250929050565b610121816100a7565b82525050565b5f60208201905061013a5f830184610118565b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f610177826100a7565b9150610182836100a7565b9250828202610190816100a7565b915082820484148315176101a7576101a6610140565b5b509291505056fea264697066735822122071d40daa3d2beacd91f29d29ccf1c0b6f312e805f50b37166267c0a2a55e6e6164736f6c634300081c0033';
            await anvilProvider.send('anvil_setCode', [testContractAddress, miniContractBytecode]);
        });
        it('should call test() function and return 42', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'test() returns (uint256)',
                    values: []
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(42n);
        });
        it('should call multiply2numbers with parameters', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
                    values: ['7', '6']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(42n);
        });
        it('should resolve address from context variable', async () => {
            context.setOutput('contractAddr', testContractAddress);
            const value = {
                type: 'call',
                arguments: {
                    to: '{{contractAddr}}',
                    signature: 'test() returns (uint256)',
                    values: []
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(42n);
        });
        it('should resolve parameters from context variables', async () => {
            context.setOutput('firstNumber', '15');
            context.setOutput('secondNumber', '25');
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
                    values: ['{{firstNumber}}', '{{secondNumber}}']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(375n);
        });
        it('should handle large number multiplication', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
                    values: ['1000000000000000000', '2000000000000000000']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(2000000000000000000000000000000000000n);
        });
        it('should throw error when calling non-existent function on deployed contract', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'nonExistentFunction() view returns (uint256)',
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/call: Failed to execute contract call:/);
        });
        it('should throw error for mismatched parameter count', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
                    values: ['10']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/call: Failed to execute contract call:/);
        });
        it('should handle type mismatches gracefully', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
                    values: ['not-a-number', 'also-not-a-number']
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/call: Failed to execute contract call:/);
        });
        it('should throw error when no target address provided', async () => {
            const value = {
                type: 'call',
                arguments: {
                    signature: 'test() returns (uint256)',
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('call: target address (to) is required');
        });
        it('should throw error for invalid target address', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: 'invalid-address',
                    signature: 'test() returns (uint256)',
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('call: invalid target address: invalid-address');
        });
        it('should throw error when no signature provided', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: null,
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('call: function signature is required');
        });
        it('should throw error when no values array provided', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'test() returns (uint256)',
                    values: null
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('call: values array is required');
        });
        it('should throw error for invalid function signature', async () => {
            const originalConsoleLog = console.log;
            console.log = jest.fn();
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'invalid signature format',
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow(/call: Failed to execute contract call:/);
            console.log = originalConsoleLog;
        });
        it('should handle null address gracefully', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: null,
                    signature: 'test() returns (uint256)',
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('call: target address (to) is required');
        });
        it('should handle undefined address gracefully', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: undefined,
                    signature: 'test() returns (uint256)',
                    values: []
                }
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('call: target address (to) is required');
        });
        it('should work with zero parameters', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'test() returns (uint256)',
                    values: []
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(42n);
        });
        it('should work with string parameters converted to numbers', async () => {
            const value = {
                type: 'call',
                arguments: {
                    to: testContractAddress,
                    signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
                    values: ['100', '200']
                }
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(20000n);
        });
    });
    describe('contract-exists', () => {
        let testContractAddress;
        let anvilProvider;
        beforeEach(async () => {
            anvilProvider = context.provider;
            testContractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
            const miniContractBytecode = '0x608060405234801561000f575f5ffd5b5060043610610034575f3560e01c80636df5b97a14610038578063f8a8fd6d14610068575b5f5ffd5b610052600480360381019061004d91906100da565b610086565b60405161005f9190610127565b60405180910390f35b61007061009b565b60405161007d9190610127565b60405180910390f35b5f8183610093919061016d565b905092915050565b5f602a905090565b5f5ffd5b5f819050919050565b6100b9816100a7565b81146100c3575f5ffd5b50565b5f813590506100d4816100b0565b92915050565b5f5f604083850312156100f0576100ef6100a3565b5b5f6100fd858286016100c6565b925050602061010e858286016100c6565b9150509250929050565b610121816100a7565b82525050565b5f60208201905061013a5f830184610118565b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f610177826100a7565b9150610182836100a7565b9250828202610190816100a7565b915082820484148315176101a7576101a6610140565b5b509291505056fea264697066735822122071d40daa3d2beacd91f29d29ccf1c0b6f312e805f50b37166267c0a2a55e6e6164736f6c634300081c0033';
            await anvilProvider.send('anvil_setCode', [testContractAddress, miniContractBytecode]);
        });
        it('should return true if contract exists', async () => {
            const value = {
                type: 'contract-exists',
                arguments: {
                    address: testContractAddress,
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(true);
        });
        it('should return false if contract does not exist', async () => {
            const value = {
                type: 'contract-exists',
                arguments: {
                    address: '0x0000000000000000000000000000000000000001',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe(false);
        });
        it('should throw error for null address', async () => {
            const value = {
                type: 'contract-exists',
                arguments: {
                    address: null,
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('contract-exists: invalid address: null');
        });
        it('should throw error for undefined address', async () => {
            const value = {
                type: 'contract-exists',
                arguments: {
                    address: undefined,
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('contract-exists: invalid address: undefined');
        });
        it('should throw error for invalid address', async () => {
            const value = {
                type: 'contract-exists',
                arguments: {
                    address: 'invalid-address',
                },
            };
            await expect(resolver.resolve(value, context)).rejects.toThrow('contract-exists: invalid address: invalid-address');
        });
    });
    describe('slice-bytes', () => {
        it('should slice bytes with explicit start and end positions', async () => {
            const value = {
                type: 'slice-bytes',
                arguments: {
                    value: '0x112233445566',
                    start: 1,
                    end: 4,
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x223344');
        });
        it('should support negative indexes to drop trailing bytes', async () => {
            const value = {
                type: 'slice-bytes',
                arguments: {
                    value: '0xdeadbeefcafebabe',
                    end: -1,
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xdeadbeefcafeba');
        });
        it('should accept range syntax', async () => {
            const value = {
                type: 'slice-bytes',
                arguments: {
                    value: '0xaabbccddeeff',
                    range: '0:2',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xaabb');
        });
        it('should handle open range syntax with missing start', async () => {
            const value = {
                type: 'slice-bytes',
                arguments: {
                    value: '0xaabbccddeeff',
                    range: ':-1',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0xaabbccddee');
        });
        it('should accept bracketed range syntax', async () => {
            const value = {
                type: 'slice-bytes',
                arguments: {
                    value: '0x0102030405',
                    range: '[:3]',
                },
            };
            const result = await resolver.resolve(value, context);
            expect(result).toBe('0x010203');
        });
    });
});
//# sourceMappingURL=resolver.spec.js.map