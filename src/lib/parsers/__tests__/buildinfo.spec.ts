import * as fs from 'fs'
import * as path from 'path'
import { parseBuildInfo, isBuildInfoFile, extractedContractToArtifact } from '../buildinfo'

describe('Build-Info Parsing', () => {
  const fixturesDir = path.join(__dirname, 'fixtures/buildinfo')

  // Helper function to read fixture files
  const readFixture = (filename: string): string => {
    return fs.readFileSync(path.join(fixturesDir, filename), 'utf-8')
  }

  describe('isBuildInfoFile function', () => {
    it('should identify build-info files correctly', () => {
      expect(isBuildInfoFile('artifacts/build-info/abc123.json')).toBe(true)
      expect(isBuildInfoFile('out/build-info/def456.json')).toBe(true)
      expect(isBuildInfoFile('/path/to/artifacts/build-info/xyz789.json')).toBe(true)
      
      expect(isBuildInfoFile('artifacts/Contract.json')).toBe(false)
      expect(isBuildInfoFile('src/Contract.sol')).toBe(false)
      expect(isBuildInfoFile('build-info.json')).toBe(false)
    })
  })

  describe('parseBuildInfo function', () => {
    it('should parse a simple build-info file with one contract', () => {
      const content = readFixture('simple-buildinfo.json')
      const result = parseBuildInfo(content, '/test/simple-buildinfo.json')

      expect(result).not.toBeNull()
      expect(result).toHaveLength(1)
      
      const contract = result![0]
      expect(contract.contractName).toBe('Counter')
      expect(contract.sourceName).toBe('src/Counter.sol')
      expect(contract.fullyQualifiedName).toBe('src/Counter.sol:Counter')
      expect(contract.abi).toBeInstanceOf(Array)
      expect(contract.abi.length).toBe(2)
      expect(contract.bytecode).toMatch(/^0x[0-9a-fA-F]+$/)
      expect(contract.deployedBytecode).toMatch(/^0x[0-9a-fA-F]+$/)
      expect(contract.compiler.version).toBe('0.8.30+commit.8fe82020')
      expect(contract.buildInfoId).toBe('901568e56d422b1e1e3f64004cb4dd6e')
    })

    it('should parse a build-info file with multiple contracts', () => {
      const content = readFixture('multi-contract-buildinfo.json')
      const result = parseBuildInfo(content, '/test/multi-contract-buildinfo.json')

      expect(result).not.toBeNull()
      expect(result).toHaveLength(2)
      
      const contracts = result!
      expect(contracts.map(c => c.contractName)).toEqual(['Token', 'TokenFactory'])
      expect(contracts.map(c => c.sourceName)).toEqual(['src/Token.sol', 'src/TokenFactory.sol'])
      expect(contracts.map(c => c.fullyQualifiedName)).toEqual([
        'src/Token.sol:Token',
        'src/TokenFactory.sol:TokenFactory'
      ])
    })

    it('should return null for invalid JSON', () => {
      const content = readFixture('invalid-json.txt')
      const result = parseBuildInfo(content, '/test/invalid-json.txt')

      expect(result).toBeNull()
    })

    it('should return null for JSON with wrong format', () => {
      const content = readFixture('wrong-format.json')
      const result = parseBuildInfo(content, '/test/wrong-format.json')

      expect(result).toBeNull()
    })

    it('should return null for build-info with no contracts', () => {
      const content = readFixture('no-contracts-buildinfo.json')
      const result = parseBuildInfo(content, '/test/no-contracts-buildinfo.json')

      expect(result).toBeNull()
    })

    it('should skip contracts with invalid bytecode', () => {
      const content = readFixture('invalid-bytecode-buildinfo.json')
      const result = parseBuildInfo(content, '/test/invalid-bytecode-buildinfo.json')

      expect(result).not.toBeNull()
      expect(result).toHaveLength(1) // Only one valid contract should be extracted
      expect(result![0].contractName).toBe('ValidContract')
    })

    it('should include source content when available', () => {
      const content = readFixture('simple-buildinfo.json')
      const result = parseBuildInfo(content, '/test/simple-buildinfo.json')

      expect(result).not.toBeNull()
      expect(result![0].source).toContain('contract Counter')
    })
  })

  describe('extractedContractToArtifact function', () => {
    it('should convert ExtractedContract to Artifact format', () => {
      const content = readFixture('simple-buildinfo.json')
      const contracts = parseBuildInfo(content, '/test/simple-buildinfo.json')
      
      expect(contracts).not.toBeNull()
      const extracted = contracts![0]
      const artifact = extractedContractToArtifact(extracted)

      expect(artifact.contractName).toBe(extracted.contractName)
      expect(artifact.abi).toBe(extracted.abi)
      expect(artifact.bytecode).toBe(extracted.bytecode)
      expect(artifact.deployedBytecode).toBe(extracted.deployedBytecode)
      expect(artifact.sourceName).toBe(extracted.sourceName)
      expect(artifact.source).toBe(extracted.source)
      expect(artifact.compiler).toBe(extracted.compiler)
      
      // Should not have build-info specific fields
      expect(artifact).not.toHaveProperty('buildInfoId')
      expect(artifact).not.toHaveProperty('fullyQualifiedName')
    })
  })
}) 