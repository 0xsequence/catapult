import * as fs from 'fs'
import * as path from 'path'
import { parseArtifact } from '../index'
import { naiveParser } from '../naive'

describe('Artifact Parsing', () => {
  const fixturesDir = path.join(__dirname, 'fixtures')

  // Helper function to read fixture files
  const readFixture = (filename: string): string => {
    return fs.readFileSync(path.join(fixturesDir, filename), 'utf-8')
  }

  describe('parseArtifact function', () => {
    it('should parse a simple artifact with string bytecode', () => {
      const content = readFixture('simple-artifact.json')
      const result = parseArtifact(content, '/test/simple-artifact.json')

      expect(result).not.toBeNull()
      expect(result!.contractName).toBe('SimpleToken')
      expect(result!.abi).toBeInstanceOf(Array)
      expect(result!.abi.length).toBe(2)
      expect(result!.bytecode).toMatch(/^0x[0-9a-fA-F]+$/)
      expect(result!.deployedBytecode).toMatch(/^0x[0-9a-fA-F]+$/)
    })

    it('should parse a Hardhat-style artifact with bytecode object', () => {
      const content = readFixture('hardhat-artifact.json')
      const result = parseArtifact(content, '/test/hardhat-artifact.json')

      expect(result).not.toBeNull()
      expect(result!.contractName).toBe('ERC20Token')
      expect(result!.sourceName).toBe('contracts/ERC20Token.sol')
      expect(result!.abi).toBeInstanceOf(Array)
      expect(result!.abi.length).toBe(3)
      expect(result!.bytecode).toMatch(/^0x[0-9a-fA-F]+$/)
      expect(result!.deployedBytecode).toMatch(/^0x[0-9a-fA-F]+$/)
      expect(result!.compiler).toBeDefined()
      expect(result!.compiler!.version).toBe('0.8.19+commit.7dd6d404')
      expect(result!.source).toContain('contract ERC20Token')
    })

    it('should parse a minimal artifact with only required fields', () => {
      const content = readFixture('minimal-artifact.json')
      const result = parseArtifact(content, '/test/minimal-artifact.json')

      expect(result).not.toBeNull()
      expect(result!.contractName).toBe('Minimal')
      expect(result!.abi).toBeInstanceOf(Array)
      expect(result!.abi.length).toBe(0)
      expect(result!.bytecode).toBe('0x608060405234801561001057600080fd5b50')
      expect(result!.deployedBytecode).toBeUndefined()
      expect(result!.sourceName).toBeUndefined()
      expect(result!.source).toBeUndefined()
      expect(result!.compiler).toBeUndefined()
    })

    it('should return null for invalid JSON', () => {
      const content = readFixture('invalid-json.txt')
      const result = parseArtifact(content, '/test/invalid-json.txt')

      expect(result).toBeNull()
    })

    it('should return null when contractName is missing', () => {
      const content = readFixture('missing-contract-name.json')
      const result = parseArtifact(content, '/test/missing-contract-name.json')

      expect(result).toBeNull()
    })

    it('should return null when abi is missing', () => {
      const content = readFixture('missing-abi.json')
      const result = parseArtifact(content, '/test/missing-abi.json')

      expect(result).toBeNull()
    })

    it('should return null when bytecode is missing', () => {
      const content = readFixture('missing-bytecode.json')
      const result = parseArtifact(content, '/test/missing-bytecode.json')

      expect(result).toBeNull()
    })

    it('should return null when bytecode does not start with 0x', () => {
      const content = readFixture('invalid-bytecode.json')
      const result = parseArtifact(content, '/test/invalid-bytecode.json')

      expect(result).toBeNull()
    })

    it('should return null when bytecode is empty', () => {
      const content = readFixture('empty-bytecode.json')
      const result = parseArtifact(content, '/test/empty-bytecode.json')

      expect(result).toBeNull()
    })

    it('should return null when fields have wrong types', () => {
      const content = readFixture('wrong-types.json')
      const result = parseArtifact(content, '/test/wrong-types.json')

      expect(result).toBeNull()
    })

    it('should handle null input gracefully', () => {
      const result = parseArtifact('null', '/test/null.json')
      expect(result).toBeNull()
    })

    it('should handle empty string input gracefully', () => {
      const result = parseArtifact('', '/test/empty.json')
      expect(result).toBeNull()
    })
  })

  describe('naiveParser function', () => {
    it('should parse artifact with string bytecode', () => {
      const content = readFixture('simple-artifact.json')
      const result = naiveParser(content, '/test/simple-artifact.json')

      expect(result).not.toBeNull()
      expect(result!.contractName).toBe('SimpleToken')
      expect(result!.bytecode).toMatch(/^0x[0-9a-fA-F]+$/)
    })

    it('should parse artifact with Hardhat-style bytecode object', () => {
      const content = readFixture('hardhat-artifact.json')
      const result = naiveParser(content, '/test/hardhat-artifact.json')

      expect(result).not.toBeNull()
      expect(result!.contractName).toBe('ERC20Token')
      expect(result!.bytecode).toMatch(/^0x[0-9a-fA-F]+$/)
    })

    it('should handle deployedBytecode as string', () => {
      const artifact = {
        contractName: 'Test',
        abi: [],
        bytecode: '0x123',
        deployedBytecode: '0x456'
      }
      const result = naiveParser(JSON.stringify(artifact), '/test.json')

      expect(result).not.toBeNull()
      expect(result!.deployedBytecode).toBe('0x456')
    })

    it('should handle deployedBytecode as object', () => {
      const artifact = {
        contractName: 'Test',
        abi: [],
        bytecode: '0x123',
        deployedBytecode: {
          object: '0x456'
        }
      }
      const result = naiveParser(JSON.stringify(artifact), '/test.json')

      expect(result).not.toBeNull()
      expect(result!.deployedBytecode).toBe('0x456')
    })

    it('should handle missing deployedBytecode', () => {
      const artifact = {
        contractName: 'Test',
        abi: [],
        bytecode: '0x123'
      }
      const result = naiveParser(JSON.stringify(artifact), '/test.json')

      expect(result).not.toBeNull()
      expect(result!.deployedBytecode).toBeUndefined()
    })

    it('should reject bytecode object without object property', () => {
      const artifact = {
        contractName: 'Test',
        abi: [],
        bytecode: {
          notObject: '0x123'
        }
      }
      const result = naiveParser(JSON.stringify(artifact), '/test.json')

      expect(result).toBeNull()
    })

    it('should reject when contractName is not a string', () => {
      const artifact = {
        contractName: 123,
        abi: [],
        bytecode: '0x123'
      }
      const result = naiveParser(JSON.stringify(artifact), '/test.json')

      expect(result).toBeNull()
    })

    it('should reject when abi is not an array', () => {
      const artifact = {
        contractName: 'Test',
        abi: 'not-array',
        bytecode: '0x123'
      }
      const result = naiveParser(JSON.stringify(artifact), '/test.json')

      expect(result).toBeNull()
    })

    it('should preserve optional fields when present', () => {
      const content = readFixture('hardhat-artifact.json')
      const result = naiveParser(content, '/test/hardhat-artifact.json')

      expect(result).not.toBeNull()
      expect(result!.sourceName).toBe('contracts/ERC20Token.sol')
      expect(result!.compiler).toBeDefined()
      expect(result!.source).toContain('contract ERC20Token')
    })
  })
}) 