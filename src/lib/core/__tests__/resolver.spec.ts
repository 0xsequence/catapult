import { ethers } from 'ethers'
import { ValueResolver } from '../resolver'
import { ExecutionContext } from '../context'
import { BasicArithmeticValue, Network, ReadBalanceValue, ComputeCreate2Value, ConstructorEncodeValue, AbiEncodeValue, CallValue } from '../../types'

describe('ValueResolver', () => {
  let resolver: ValueResolver
  let context: ExecutionContext
  let mockNetwork: Network

  beforeEach(() => {
    resolver = new ValueResolver()
    mockNetwork = { name: 'testnet', chainId: 999, rpcUrl: 'http://localhost:8545' }
    // A dummy private key is fine as these tests don't send transactions
    const mockPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001'
    context = new ExecutionContext(mockNetwork, mockPrivateKey)
  })

  describe('basic-arithmetic', () => {
    it('should add two numbers', async () => {
      const value: BasicArithmeticValue = {
        type: 'basic-arithmetic',
        arguments: { operation: 'add', values: ["100", "50"] },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('150')
    })

    it('should subtract two numbers', async () => {
      const value: BasicArithmeticValue = {
        type: 'basic-arithmetic',
        arguments: { operation: 'sub', values: [100, 50] },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('50')
    })

    it('should multiply two numbers', async () => {
      const value: BasicArithmeticValue = {
        type: 'basic-arithmetic',
        arguments: { operation: 'mul', values: [10, 5] },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('50')
    })

    it('should divide two numbers (integer division)', async () => {
      const value: BasicArithmeticValue = {
        type: 'basic-arithmetic',
        arguments: { operation: 'div', values: [10, 3] },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('3')
    })

    it('should handle large numbers as strings', async () => {
      const value: BasicArithmeticValue = {
        type: 'basic-arithmetic',
        arguments: { operation: 'add', values: ['10000000000000000000', '5000000000000000000'] },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('15000000000000000000')
    })

    it('should correctly evaluate "eq" (equal)', async () => {
      const valueTrue: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'eq', values: [10, 10] } }
      const valueFalse: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'eq', values: [10, 5] } }
      expect(await resolver.resolve(valueTrue, context)).toBe(true)
      expect(await resolver.resolve(valueFalse, context)).toBe(false)
    })

    it('should correctly evaluate "neq" (not equal)', async () => {
      const valueTrue: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'neq', values: [10, 5] } }
      const valueFalse: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'neq', values: [10, 10] } }
      expect(await resolver.resolve(valueTrue, context)).toBe(true)
      expect(await resolver.resolve(valueFalse, context)).toBe(false)
    })

    it('should correctly evaluate "gt" (greater than)', async () => {
      const valueTrue: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'gt', values: [10, 5] } }
      const valueFalse: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'gt', values: [10, 10] } }
      expect(await resolver.resolve(valueTrue, context)).toBe(true)
      expect(await resolver.resolve(valueFalse, context)).toBe(false)
    })

    it('should correctly evaluate "gte" (greater than or equal)', async () => {
      const valueTrue1: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'gte', values: [10, 5] } }
      const valueTrue2: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'gte', values: [10, 10] } }
      const valueFalse: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'gte', values: [5, 10] } }
      expect(await resolver.resolve(valueTrue1, context)).toBe(true)
      expect(await resolver.resolve(valueTrue2, context)).toBe(true)
      expect(await resolver.resolve(valueFalse, context)).toBe(false)
    })

    it('should correctly evaluate "lt" (less than)', async () => {
        const valueTrue: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'lt', values: [5, 10] } }
        const valueFalse: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'lt', values: [10, 10] } }
        expect(await resolver.resolve(valueTrue, context)).toBe(true)
        expect(await resolver.resolve(valueFalse, context)).toBe(false)
    })

    it('should correctly evaluate "lte" (less than or equal)', async () => {
      const valueTrue1: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'lte', values: [5, 10] } }
      const valueTrue2: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'lte', values: [10, 10] } }
      const valueFalse: BasicArithmeticValue = { type: 'basic-arithmetic', arguments: { operation: 'lte', values: [10, 5] } }
      expect(await resolver.resolve(valueTrue1, context)).toBe(true)
      expect(await resolver.resolve(valueTrue2, context)).toBe(true)
      expect(await resolver.resolve(valueFalse, context)).toBe(false)
    })

    it('should resolve nested values before performing the operation', async () => {
      context.setOutput('fee', '10000000000000000') // Set a value in the context
      const value: BasicArithmeticValue = {
        type: 'basic-arithmetic',
        arguments: { operation: 'add', values: ['{{fee}}', '5000000000000000'] },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('15000000000000000')
    })
  })

  describe('read-balance', () => {
    const testAddress = '0x1234567890123456789012345678901234567890'
    const testAddress2 = '0x0987654321098765432109876543210987654321'
    let anvilProvider: ethers.JsonRpcProvider

    beforeEach(async () => {
      anvilProvider = context.provider as ethers.JsonRpcProvider
      // Reset balances before each test
      await anvilProvider.send('anvil_setBalance', [testAddress, '0x0'])
      await anvilProvider.send('anvil_setBalance', [testAddress2, '0x0'])
    })

    it('should read balance for an address with 0 ETH', async () => {
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: testAddress },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0')
    })

    it('should read balance for an address with 1 ETH', async () => {
      // Set balance to 1 ETH (1e18 wei)
      await anvilProvider.send('anvil_setBalance', [testAddress, '0xde0b6b3a7640000'])
      
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: testAddress },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('1000000000000000000')
    })

    it('should read balance for an address with 100 ETH', async () => {
      // Set balance to 100 ETH (100e18 wei)
      await anvilProvider.send('anvil_setBalance', [testAddress, '0x56bc75e2d63100000'])
      
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: testAddress },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('100000000000000000000')
    })

    it('should read balance for an address with custom amount', async () => {
      // Set balance to 12.345 ETH (12345000000000000000 wei)
      await anvilProvider.send('anvil_setBalance', [testAddress, '0xab524017e8328000'])
      
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: testAddress },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('12345000000000000000')
    })

    it('should read different balances for different addresses', async () => {
      // Set different balances for two addresses
      await anvilProvider.send('anvil_setBalance', [testAddress, '0xde0b6b3a7640000']) // 1 ETH
      await anvilProvider.send('anvil_setBalance', [testAddress2, '0x1bc16d674ec80000']) // 2 ETH
      
      const value1: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: testAddress },
      }
      const value2: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: testAddress2 },
      }
      
      const result1 = await resolver.resolve(value1, context)
      const result2 = await resolver.resolve(value2, context)
      
      expect(result1).toBe('1000000000000000000')
      expect(result2).toBe('2000000000000000000')
    })

    it('should resolve address from context variable', async () => {
      context.setOutput('myAddress', testAddress)
      await anvilProvider.send('anvil_setBalance', [testAddress, '0xde0b6b3a7640000']) // 1 ETH
      
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: '{{myAddress}}' },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('1000000000000000000')
    })

    it('should throw error for invalid address', async () => {
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: 'invalid-address' },
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid address: invalid-address')
    })

    it('should throw error for null address', async () => {
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: null as any },
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid address: null')
    })

    it('should throw error for undefined address', async () => {
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: undefined as any },
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid address: undefined')
    })

    it('should handle very large balance amounts', async () => {
      // Set a very large balance (max uint256)
      await anvilProvider.send('anvil_setBalance', [testAddress, '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'])
      
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: testAddress },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('115792089237316195423570985008687907853269984665640564039457584007913129639935')
    })

    it('should handle checksummed addresses', async () => {
      const checksummedAddress = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
      await anvilProvider.send('anvil_setBalance', [checksummedAddress, '0xde0b6b3a7640000']) // 1 ETH
      
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: checksummedAddress },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('1000000000000000000')
    })

    it('should handle lowercase addresses', async () => {
      const lowercaseAddress = testAddress.toLowerCase()
      await anvilProvider.send('anvil_setBalance', [lowercaseAddress, '0xde0b6b3a7640000']) // 1 ETH
      
      const value: ReadBalanceValue = {
        type: 'read-balance',
        arguments: { address: lowercaseAddress },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('1000000000000000000')
    })
  })

  describe('compute-create2', () => {
    it('should compute CREATE2 address with hardcoded test case 1', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x0000000000000000000000000000000000000000',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: '0x00',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38')
    })

    it('should compute CREATE2 address with hardcoded test case 2', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0xdeadbeef00000000000000000000000000000000',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: '0x00',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0xB928f69Bb1D91Cd65274e3c79d8986362984fDA3')
    })

    it('should compute CREATE2 address with hardcoded test case 3', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0xdeadbeef00000000000000000000000000000000',
          salt: '0x000000000000000000000000feed000000000000000000000000000000000000',
          initCode: '0x00',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0xD04116cDd17beBE565EB2422F2497E06cC1C9833')
    })

    it('should compute CREATE2 address with hardcoded test case 4', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x0000000000000000000000000000000000000000',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: '0xdeadbeef',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x70f2b2914A2a4b783FaEFb75f459A580616Fcb5e')
    })

    it('should compute CREATE2 address with hardcoded test case 5', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x00000000000000000000000000000000deadbeef',
          salt: '0x00000000000000000000000000000000000000000000000000000000cafebabe',
          initCode: '0xdeadbeef',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x60f3f640a8508fC6a86d45DF051962668E1e8AC7')
    })

    it('should compute CREATE2 address with hardcoded test case 6', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x00000000000000000000000000000000deadbeef',
          salt: '0x00000000000000000000000000000000000000000000000000000000cafebabe',
          initCode: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x1d8bfDC5D46DC4f61D6b6115972536eBE6A8854C')
    })

    it('should compute CREATE2 address with hardcoded test case 7 (empty initCode)', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x0000000000000000000000000000000000000000',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: '0x',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0xE33C0C7F7df4809055C3ebA6c09CFe4BaF1BD9e0')
    })

    it('should resolve values from context before computing CREATE2 address', async () => {
      context.setOutput('myDeployer', '0x0000000000000000000000000000000000000000')
      context.setOutput('mySalt', '0x0000000000000000000000000000000000000000000000000000000000000000')
      context.setOutput('myInitCode', '0x00')
      
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '{{myDeployer}}',
          salt: '{{mySalt}}',
          initCode: '{{myInitCode}}',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38')
    })

    it('should throw error for invalid deployer address', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: 'invalid-address',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: '0x00',
        },
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid deployer address: invalid-address')
    })

    it('should throw error for invalid salt', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x0000000000000000000000000000000000000000',
          salt: 'invalid-salt',
          initCode: '0x00',
        },
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid salt: invalid-salt')
    })

    it('should throw error for invalid init code', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x0000000000000000000000000000000000000000',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: 'invalid-init-code',
        },
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid init code: invalid-init-code')
    })

    it('should throw error for null deployer address', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: null as any,
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: '0x00',
        },
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid deployer address: null')
    })

    it('should throw error for undefined salt', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x0000000000000000000000000000000000000000',
          salt: undefined as any,
          initCode: '0x00',
        },
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow('Invalid salt: undefined')
    })

    it('should handle checksummed addresses', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0xdEADBEeF00000000000000000000000000000000',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: '0x00',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0xB928f69Bb1D91Cd65274e3c79d8986362984fDA3')
    })

    it('should handle uppercase hex strings', async () => {
      const value: ComputeCreate2Value = {
        type: 'compute-create2',
        arguments: {
          deployerAddress: '0x0000000000000000000000000000000000000000',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
          initCode: '0xDEADBEEF',
        },
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x70f2b2914A2a4b783FaEFb75f459A580616Fcb5e')
    })
  })

  describe('constructor-encode', () => {
    it('should encode creation code with no constructor arguments', async () => {
      const value = {
        type: 'constructor-encode' as const,
        arguments: {
          creationCode: '0x608060405234801561001057600080fd5b50',
          types: [],
          values: []
        }
      }
      const result = await resolver.resolve(value, context)
      expect(result).toBe('0x608060405234801561001057600080fd5b50')
    })

    it('should encode creation code with a single address argument', async () => {
      const value = {
        type: 'constructor-encode' as const,
        arguments: {
          creationCode: '0x608060405234801561001057600080fd5b50',
          types: ['address'],
          values: ['0x1234567890123456789012345678901234567890']
        }
      }
      const result = await resolver.resolve(value, context)
      // Should be creation code + encoded address (padded to 32 bytes)
      expect(result).toBe('0x608060405234801561001057600080fd5b500000000000000000000000001234567890123456789012345678901234567890')
    })

    it('should encode creation code with multiple arguments', async () => {
      const value = {
        type: 'constructor-encode' as const,
        arguments: {
          creationCode: '0x608060405234801561001057600080fd5b50',
          types: ['address', 'uint256'],
          values: ['0x1234567890123456789012345678901234567890', '42']
        }
      }
      const result = await resolver.resolve(value, context) as string
      // Should concatenate creation code with ABI-encoded constructor args
      expect(result.startsWith('0x608060405234801561001057600080fd5b50')).toBe(true)
      expect(result.length).toBeGreaterThan('0x608060405234801561001057600080fd5b50'.length)
    })

    it('should validate that types and values arrays have same length', async () => {
      const value = {
        type: 'constructor-encode' as const,
        arguments: {
          creationCode: '0x608060405234801561001057600080fd5b50',
          types: ['address'],
          values: ['0x1234567890123456789012345678901234567890', '42'] // extra value
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'constructor-encode: types array length (1) must match values array length (2)'
      )
    })

    it('should validate creation code is valid bytecode', async () => {
      const value = {
        type: 'constructor-encode' as const,
        arguments: {
          creationCode: 'not-valid-bytecode',
          types: [],
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'Invalid creation code: not-valid-bytecode'
      )
    })
  })

  describe('abi-encode', () => {
    it('should encode a simple function with no parameters', async () => {
      const value: AbiEncodeValue = {
        type: 'abi-encode',
        arguments: {
          signature: 'withdraw()',
          values: []
        }
      }
      const result = await resolver.resolve(value, context) as string
      // Function selector for withdraw() should be the first 4 bytes of keccak256("withdraw()")
      expect(result).toBe('0x3ccfd60b')
    })

    it('should encode a function with a single address parameter', async () => {
      const value: AbiEncodeValue = {
        type: 'abi-encode',
        arguments: {
          signature: 'transfer(address)',
          values: ['0x1234567890123456789012345678901234567890']
        }
      }
      const result = await resolver.resolve(value, context) as string
      // Should start with function selector for transfer(address)
      expect(result.startsWith('0x1a695230')).toBe(true)
      // Should be 4 bytes (selector) + 32 bytes (address parameter) = 72 characters + 2 for '0x'
      expect(result.length).toBe(74)
    })

    it('should encode a function with multiple parameters', async () => {
      const value: AbiEncodeValue = {
        type: 'abi-encode',
        arguments: {
          signature: 'transfer(address,uint256)',
          values: ['0x1234567890123456789012345678901234567890', '1000000000000000000']
        }
      }
      const result = await resolver.resolve(value, context) as string
      // Should start with function selector for transfer(address,uint256)
      expect(result.startsWith('0xa9059cbb')).toBe(true)
      // Should be 4 bytes (selector) + 32 bytes (address) + 32 bytes (uint256) = 136 characters + 2 for '0x'
      expect(result.length).toBe(138)
    })

    it('should encode a function with various parameter types', async () => {
      const value: AbiEncodeValue = {
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
      }
      const result = await resolver.resolve(value, context) as string
      // Should be a valid hex string starting with 0x
      expect(result.startsWith('0x')).toBe(true)
      expect(result.length % 2).toBe(0) // Should be even length
      // Should be longer than just the selector due to multiple parameters
      expect(result.length).toBeGreaterThan(10)
    })

    it('should handle string parameters correctly', async () => {
      const value: AbiEncodeValue = {
        type: 'abi-encode',
        arguments: {
          signature: 'setName(string)',
          values: ['Alice']
        }
      }
      const result = await resolver.resolve(value, context) as string
      expect(result.startsWith('0x')).toBe(true)
      // Verify we can decode it back
      const iface = new ethers.Interface(['function setName(string)'])
      const decoded = iface.decodeFunctionData('setName', result)
      expect(decoded[0]).toBe('Alice')
    })

    it('should handle array parameters', async () => {
      const value: AbiEncodeValue = {
        type: 'abi-encode',
        arguments: {
          signature: 'batchTransfer(address[])',
          values: [['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321']]
        }
      }
      const result = await resolver.resolve(value, context) as string
      expect(result.startsWith('0x')).toBe(true)
      // Verify we can decode it back
      const iface = new ethers.Interface(['function batchTransfer(address[])'])
      const decoded = iface.decodeFunctionData('batchTransfer', result)
      expect(decoded[0]).toEqual(['0x1234567890123456789012345678901234567890', '0x0987654321098765432109876543210987654321'])
    })

    it('should validate that signature is provided', async () => {
      const value = {
        type: 'abi-encode' as const,
        arguments: {
          signature: null as any,
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'abi-encode: signature is required'
      )
    })

    it('should validate that values array is provided', async () => {
      const value = {
        type: 'abi-encode' as const,
        arguments: {
          signature: 'transfer(address)',
          values: null as any
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'abi-encode: values array is required'
      )
    })

    it('should handle invalid function signatures gracefully', async () => {
      const value: AbiEncodeValue = {
        type: 'abi-encode',
        arguments: {
          signature: 'invalid signature format',
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        /abi-encode: Failed to encode function data:/
      )
    })

    it('should handle mismatched parameter count', async () => {
      const value: AbiEncodeValue = {
        type: 'abi-encode',
        arguments: {
          signature: 'transfer(address,uint256)',
          values: ['0x1234567890123456789012345678901234567890'] // Missing the uint256 parameter
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        /abi-encode: Failed to encode function data:/
      )
    })

    it('should handle type mismatches gracefully', async () => {
      const value: AbiEncodeValue = {
        type: 'abi-encode',
        arguments: {
          signature: 'transfer(address,uint256)',
          values: ['not-an-address', 'not-a-number']
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        /abi-encode: Failed to encode function data:/
      )
    })
  })

  describe('call', () => {
    let testContractAddress: string
    let anvilProvider: ethers.JsonRpcProvider

    beforeEach(async () => {
      anvilProvider = context.provider as ethers.JsonRpcProvider

      // Set the Mini contract bytecode directly to an address using anvil_setCode
      // This contract has: 
      // - test() public returns (uint256) -> returns 42
      // - multiply2numbers(uint256 a, uint256 b) public returns (uint256) -> returns a * b
      testContractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3' // Standard first contract address
      const miniContractBytecode = '0x608060405234801561000f575f5ffd5b5060043610610034575f3560e01c80636df5b97a14610038578063f8a8fd6d14610068575b5f5ffd5b610052600480360381019061004d91906100da565b610086565b60405161005f9190610127565b60405180910390f35b61007061009b565b60405161007d9190610127565b60405180910390f35b5f8183610093919061016d565b905092915050565b5f602a905090565b5f5ffd5b5f819050919050565b6100b9816100a7565b81146100c3575f5ffd5b50565b5f813590506100d4816100b0565b92915050565b5f5f604083850312156100f0576100ef6100a3565b5b5f6100fd858286016100c6565b925050602061010e858286016100c6565b9150509250929050565b610121816100a7565b82525050565b5f60208201905061013a5f830184610118565b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f610177826100a7565b9150610182836100a7565b9250828202610190816100a7565b915082820484148315176101a7576101a6610140565b5b509291505056fea264697066735822122071d40daa3d2beacd91f29d29ccf1c0b6f312e805f50b37166267c0a2a55e6e6164736f6c634300081c0033'

      // Use anvil_setCode to set the deployed bytecode directly at the address
      await anvilProvider.send('anvil_setCode', [testContractAddress, miniContractBytecode])
    })

    it('should call test() function and return 42', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'test() returns (uint256)',
          values: []
        }
      }
      
      const result = await resolver.resolve(value, context)
      expect(result).toBe(42n) // ethers returns BigInt for uint256
    })

    it('should call multiply2numbers with parameters', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
          values: ['7', '6']
        }
      }
      
      const result = await resolver.resolve(value, context)
      expect(result).toBe(42n) // 7 * 6 = 42
    })

    it('should resolve address from context variable', async () => {
      context.setOutput('contractAddr', testContractAddress)
      
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: '{{contractAddr}}',
          signature: 'test() returns (uint256)',
          values: []
        }
      }
      
      const result = await resolver.resolve(value, context)
      expect(result).toBe(42n)
    })

    it('should resolve parameters from context variables', async () => {
      context.setOutput('firstNumber', '15')
      context.setOutput('secondNumber', '25')
      
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
          values: ['{{firstNumber}}', '{{secondNumber}}']
        }
      }
      
      const result = await resolver.resolve(value, context)
      expect(result).toBe(375n) // 15 * 25 = 375
    })

    it('should handle large number multiplication', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
          values: ['1000000000000000000', '2000000000000000000'] // 1e18 * 2e18
        }
      }
      
      const result = await resolver.resolve(value, context)
      expect(result).toBe(2000000000000000000000000000000000000n) // 2e36
    })

    it('should throw error when calling non-existent function on deployed contract', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'nonExistentFunction() view returns (uint256)',
          values: []
        }
      }
      
      // This should fail because the function doesn't exist on the contract
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        /call: Failed to execute contract call:/
      )
    })

    it('should throw error for mismatched parameter count', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
          values: ['10'] // Missing the second parameter
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        /call: Failed to execute contract call:/
      )
    })

    it('should handle type mismatches gracefully', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
          values: ['not-a-number', 'also-not-a-number']
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        /call: Failed to execute contract call:/
      )
    })

    it('should throw error when no target address provided', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          signature: 'test() returns (uint256)',
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'call: target address (to) is required'
      )
    })

    it('should throw error for invalid target address', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: 'invalid-address',
          signature: 'test() returns (uint256)',
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'call: invalid target address: invalid-address'
      )
    })

    it('should throw error when no signature provided', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: null as any,
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'call: function signature is required'
      )
    })

    it('should throw error when no values array provided', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'test() returns (uint256)',
          values: null as any
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'call: values array is required'
      )
    })

    it('should throw error for invalid function signature', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'invalid signature format',
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        /call: Failed to execute contract call:/
      )
    })

    it('should handle null address gracefully', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: null as any,
          signature: 'test() returns (uint256)',
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'call: target address (to) is required'
      )
    })

    it('should handle undefined address gracefully', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: undefined as any,
          signature: 'test() returns (uint256)',
          values: []
        }
      }
      
      await expect(resolver.resolve(value, context)).rejects.toThrow(
        'call: target address (to) is required'
      )
    })

    it('should work with zero parameters', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'test() returns (uint256)',
          values: []
        }
      }
      
      const result = await resolver.resolve(value, context)
      expect(result).toBe(42n)
    })

    it('should work with string parameters converted to numbers', async () => {
      const value: CallValue = {
        type: 'call',
        arguments: {
          to: testContractAddress,
          signature: 'multiply2numbers(uint256,uint256) returns (uint256)',
          values: ['100', '200']
        }
      }
      
      const result = await resolver.resolve(value, context)
      expect(result).toBe(20000n)
    })
  })
})