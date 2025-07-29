import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { ArtifactRegistry } from '../registry'
import { Artifact } from '../../types'

describe('ArtifactRegistry', () => {
  let registry: ArtifactRegistry
  let tempDir: string
  let fixturesDir: string

  beforeEach(() => {
    registry = new ArtifactRegistry()
    fixturesDir = path.join(__dirname, 'fixtures')
  })

  afterEach(async () => {
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.promises.rm(tempDir, { recursive: true })
    }
  })

  // Helper function to create temporary test files
  const createTempDir = async (): Promise<string> => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'artifact-registry-test-'))
    return tempDir
  }

  const copyFixture = async (fixtureName: string, targetPath: string) => {
    const sourcePath = path.join(fixturesDir, fixtureName)
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.promises.copyFile(sourcePath, targetPath)
  }

  describe('add method', () => {
    it('should add a single artifact to the registry', () => {
      const artifact: Artifact = {
        contractName: 'TestContract',
        abi: [],
        bytecode: '0x123',
        _path: '/test/path.json',
        _hash: 'testhash'
      }

      registry.add(artifact)

      const found = registry.lookup('TestContract')
      expect(found).toBeDefined()
      expect(found!.contractName).toBe('TestContract')
      expect(found!._path).toBe('/test/path.json')
      expect(found!._hash).toBe('testhash')
    })

    it('should handle duplicate contract names and disable name-based lookup', () => {
      // Import the deploymentEvents to listen for events
      const { deploymentEvents } = require('../../events')
      const emittedEvents: any[] = []
      
      const eventListener = (event: any) => {
        emittedEvents.push(event)
      }
      
      deploymentEvents.onAnyEvent(eventListener)

      const artifact1: Artifact = {
        contractName: 'DuplicateName',
        abi: [],
        bytecode: '0x123',
        _path: '/test/path1.json',
        _hash: 'hash1'
      }

      const artifact2: Artifact = {
        contractName: 'DuplicateName',
        abi: [],
        bytecode: '0x456',
        _path: '/test/path2.json',
        _hash: 'hash2'
      }

      registry.add(artifact1)
      registry.add(artifact2)

      // No warning should be emitted during add phase
      let warningEvent = emittedEvents.find(e => e.type === 'duplicate_artifact_warning')
      expect(warningEvent).toBeUndefined()

      // Warning should only be emitted when trying to lookup by name
      const foundByName = registry.lookup('DuplicateName')
      expect(foundByName).toBeUndefined()

      // Now the warning should be emitted
      warningEvent = emittedEvents.find(e => e.type === 'duplicate_artifact_warning')
      expect(warningEvent).toBeDefined()
      expect(warningEvent.data.contractName).toBe('DuplicateName')

      // But hash-based lookup should still work without warnings
      const foundByHash1 = registry.lookup('hash1')
      expect(foundByHash1).toBeDefined()
      expect(foundByHash1!._path).toBe('/test/path1.json')

      const foundByHash2 = registry.lookup('hash2')
      expect(foundByHash2).toBeDefined()
      expect(foundByHash2!._path).toBe('/test/path2.json')

      // And path-based lookup should still work
      const foundByPath1 = registry.lookup('/test/path1.json')
      expect(foundByPath1).toBeDefined()
      expect(foundByPath1!._path).toBe('/test/path1.json')

      const foundByPath2 = registry.lookup('/test/path2.json')
      expect(foundByPath2).toBeDefined()
      expect(foundByPath2!._path).toBe('/test/path2.json')

      deploymentEvents.off('event', eventListener)
    })

    it('should handle duplicate hashes silently', () => {
      const artifact1: Artifact = {
        contractName: 'Contract1',
        abi: [],
        bytecode: '0x123',
        _path: '/test/path1.json',
        _hash: 'samehash'
      }

      const artifact2: Artifact = {
        contractName: 'Contract2',
        abi: [],
        bytecode: '0x123',
        _path: '/test/path2.json',
        _hash: 'samehash'
      }

      expect(() => {
        registry.add(artifact1)
        registry.add(artifact2)
      }).not.toThrow()

      // Both should be accessible by name
      expect(registry.lookup('Contract1')).toBeDefined()
      expect(registry.lookup('Contract2')).toBeDefined()
      
      // Hash lookup should return the last added
      expect(registry.lookup('samehash')!.contractName).toBe('Contract2')
    })

    it('should still allow name-based lookup for non-duplicate contract names', () => {
      const artifact1: Artifact = {
        contractName: 'UniqueContract1',
        abi: [],
        bytecode: '0x123',
        _path: '/test/path1.json',
        _hash: 'hash1'
      }

      const artifact2: Artifact = {
        contractName: 'UniqueContract2',
        abi: [],
        bytecode: '0x456',
        _path: '/test/path2.json',
        _hash: 'hash2'
      }

      registry.add(artifact1)
      registry.add(artifact2)

      // Name-based lookup should work for unique names
      const found1 = registry.lookup('UniqueContract1')
      expect(found1).toBeDefined()
      expect(found1!._path).toBe('/test/path1.json')
      expect(found1!._hash).toBe('hash1')

      const found2 = registry.lookup('UniqueContract2')
      expect(found2).toBeDefined()
      expect(found2!._path).toBe('/test/path2.json')
      expect(found2!._hash).toBe('hash2')
    })

    it('should handle mixed scenarios with some duplicates and some unique names', () => {
      const artifact1: Artifact = {
        contractName: 'DuplicateName',
        abi: [],
        bytecode: '0x123',
        _path: '/test/path1.json',
        _hash: 'hash1'
      }

      const artifact2: Artifact = {
        contractName: 'DuplicateName',
        abi: [],
        bytecode: '0x456',
        _path: '/test/path2.json',
        _hash: 'hash2'
      }

      const artifact3: Artifact = {
        contractName: 'UniqueName',
        abi: [],
        bytecode: '0x789',
        _path: '/test/path3.json',
        _hash: 'hash3'
      }

      registry.add(artifact1)
      registry.add(artifact2)
      registry.add(artifact3)

      // Duplicate name should not be resolvable by name
      const duplicateByName = registry.lookup('DuplicateName')
      expect(duplicateByName).toBeUndefined()

      // But unique name should still work
      const uniqueByName = registry.lookup('UniqueName')
      expect(uniqueByName).toBeDefined()
      expect(uniqueByName!._path).toBe('/test/path3.json')

      // All should be resolvable by hash
      expect(registry.lookup('hash1')).toBeDefined()
      expect(registry.lookup('hash2')).toBeDefined()
      expect(registry.lookup('hash3')).toBeDefined()

      // All should be resolvable by path
      expect(registry.lookup('/test/path1.json')).toBeDefined()
      expect(registry.lookup('/test/path2.json')).toBeDefined()
      expect(registry.lookup('/test/path3.json')).toBeDefined()
    })
  })

  describe('lookup method', () => {
    beforeEach(() => {
      // Add some test artifacts
      const artifacts: Artifact[] = [
        {
          contractName: 'TokenContract',
          abi: [],
          bytecode: '0x123',
          _path: '/contracts/TokenContract.sol/TokenContract.json',
          _hash: 'abcd1234'
        },
        {
          contractName: 'NFTContract',
          abi: [],
          bytecode: '0x456',
          _path: '/contracts/nft/NFTContract.sol/NFTContract.json',
          _hash: 'efgh5678'
        }
      ]

      artifacts.forEach(artifact => registry.add(artifact))
    })

    it('should find artifact by exact hash', () => {
      const found = registry.lookup('abcd1234')
      expect(found).toBeDefined()
      expect(found!.contractName).toBe('TokenContract')
    })

    it('should find artifact by contract name', () => {
      const found = registry.lookup('NFTContract')
      expect(found).toBeDefined()
      expect(found!.contractName).toBe('NFTContract')
    })

    it('should find artifact by full absolute path', () => {
      const found = registry.lookup('/contracts/TokenContract.sol/TokenContract.json')
      expect(found).toBeDefined()
      expect(found!.contractName).toBe('TokenContract')
    })

    it('should find artifact by partial path suffix', () => {
      const found = registry.lookup('nft/NFTContract.sol/NFTContract.json')
      expect(found).toBeDefined()
      expect(found!.contractName).toBe('NFTContract')
    })

    it('should return undefined for non-existent identifier', () => {
      const found = registry.lookup('NonExistentContract')
      expect(found).toBeUndefined()
    })

    it('should return undefined for empty identifier', () => {
      const found = registry.lookup('')
      expect(found).toBeUndefined()
    })

    it('should resolve relative paths using context', () => {
      // Add an artifact with absolute path
      const artifact: Artifact = {
        contractName: 'ContextContract',
        abi: [],
        bytecode: '0x789',
        _path: '/project/jobs/deploy/artifacts/Contract.json',
        _hash: 'context123'
      }
      registry.add(artifact)

      // Test relative path resolution with context
      const contextPath = '/project/jobs/deploy/job.yaml'
      const found = registry.lookupWithContext('./artifacts/Contract.json', contextPath)
      
      expect(found).toBeDefined()
      expect(found!.contractName).toBe('ContextContract')
    })

    it('should fallback to project root for relative paths without context', async () => {
      // Clear existing artifacts and create a test scenario
      registry = new ArtifactRegistry()
      
      // Simulate project root being set
      await registry.loadFrom('/test/project')
      
      // Add an artifact with path relative to project root
      const artifact: Artifact = {
        contractName: 'RootContract',
        abi: [],
        bytecode: '0xabc',
        _path: '/test/project/artifacts/Root.json',
        _hash: 'root123'
      }
      registry.add(artifact)

      // Test that relative path resolves against project root when no context
      const found = registry.lookupWithContext('./artifacts/Root.json')
      
      expect(found).toBeDefined()
      expect(found!.contractName).toBe('RootContract')
    })

    it('should follow lookup order: hash > name > path > partial path', () => {
      // Add an artifact where contractName could match a hash
      const artifact: Artifact = {
        contractName: 'abcd1234', // Same as existing hash
        abi: [],
        bytecode: '0x789',
        _path: '/different/path.json',
        _hash: 'differenthash'
      }
      registry.add(artifact)

      // Should find by hash first, not by name
      const found = registry.lookup('abcd1234')
      expect(found!.contractName).toBe('TokenContract') // The one with this hash
      expect(found!._hash).toBe('abcd1234')
    })
  })

  describe('loadFrom method', () => {
    it('should load artifacts from a directory with valid files', async () => {
      const tempDir = await createTempDir()
      
      // Copy some fixture files
      await copyFixture('contract1.json', path.join(tempDir, 'contract1.json'))
      await copyFixture('contract2.json', path.join(tempDir, 'contract2.json'))

      await registry.loadFrom(tempDir)

      expect(registry.lookup('TestContract1')).toBeDefined()
      expect(registry.lookup('TestContract2')).toBeDefined()
    })

    it('should recursively scan subdirectories', async () => {
      const tempDir = await createTempDir()
      
      // Create nested structure
      await copyFixture('contract1.json', path.join(tempDir, 'contracts', 'contract1.json'))
      await copyFixture('nested/nested-contract.json', path.join(tempDir, 'nested', 'deep', 'nested-contract.json'))

      await registry.loadFrom(tempDir)

      expect(registry.lookup('TestContract1')).toBeDefined()
      expect(registry.lookup('NestedContract')).toBeDefined()
    })

    it('should ignore non-JSON files', async () => {
      const tempDir = await createTempDir()
      
      await copyFixture('contract1.json', path.join(tempDir, 'contract1.json'))
      await copyFixture('readme.txt', path.join(tempDir, 'readme.txt'))

      await registry.loadFrom(tempDir)

      // Should only find the JSON artifact
      expect(registry.lookup('TestContract1')).toBeDefined()
    })

    it('should silently ignore invalid JSON files', async () => {
      const tempDir = await createTempDir()
      
      await copyFixture('contract1.json', path.join(tempDir, 'contract1.json'))
      await copyFixture('not-an-artifact.json', path.join(tempDir, 'not-an-artifact.json'))

      await registry.loadFrom(tempDir)

      // Should only find the valid artifact
      expect(registry.lookup('TestContract1')).toBeDefined()
      expect(registry.lookup('NotAnArtifact')).toBeUndefined()
    })

    it('should ignore common directories like node_modules', async () => {
      const tempDir = await createTempDir()
      
      // Create node_modules with an artifact (should be ignored)
      await copyFixture('contract1.json', path.join(tempDir, 'node_modules', 'some-package', 'contract1.json'))
      // Create dist with an artifact (should be ignored)
      await copyFixture('contract2.json', path.join(tempDir, 'dist', 'contract2.json'))
      // Create valid artifact in regular directory
      await copyFixture('contract1.json', path.join(tempDir, 'contracts', 'contract1.json'))

      await registry.loadFrom(tempDir)

      // Should only find the one outside ignored directories
      const artifacts = registry.lookup('TestContract1')
      expect(artifacts).toBeDefined()
      // Verify it's from the contracts directory, not node_modules
      expect(artifacts!._path).toContain('contracts')
      expect(artifacts!._path).not.toContain('node_modules')
      expect(artifacts!._path).not.toContain('dist')
    })

    it('should handle permission errors gracefully', async () => {
      // Try to load from a non-existent directory
      await expect(registry.loadFrom('/non/existent/directory')).resolves.not.toThrow()
    })

    it('should set correct _path and _hash properties', async () => {
      const tempDir = await createTempDir()
      const contractPath = path.join(tempDir, 'contract1.json')
      
      await copyFixture('contract1.json', contractPath)

      await registry.loadFrom(tempDir)

      const artifact = registry.lookup('TestContract1')
      expect(artifact).toBeDefined()
      expect(artifact!._path).toBe(contractPath)
      expect(artifact!._hash).toMatch(/^[a-f0-9]{32}$/) // MD5 hash format
    })

    it('should handle duplicate names from multiple files', async () => {
      // Import the deploymentEvents to listen for events
      const { deploymentEvents } = require('../../events')
      const emittedEvents: any[] = []
      
      const eventListener = (event: any) => {
        emittedEvents.push(event)
      }
      
      deploymentEvents.onAnyEvent(eventListener)

      const tempDir = await createTempDir()
      
      await copyFixture('contract1.json', path.join(tempDir, 'contract1.json'))
      await copyFixture('duplicate-name.json', path.join(tempDir, 'duplicate-name.json'))

      await registry.loadFrom(tempDir)

      // No warning should be emitted during loading
      let warningEvent = emittedEvents.find(e => e.type === 'duplicate_artifact_warning')
      expect(warningEvent).toBeUndefined()

      // Warning should only be emitted when trying to lookup by name
      const artifactByName = registry.lookup('TestContract1')
      expect(artifactByName).toBeUndefined()

      // Now the warning should be emitted
      warningEvent = emittedEvents.find(e => e.type === 'duplicate_artifact_warning')
      expect(warningEvent).toBeDefined()
      expect(warningEvent.data.contractName).toBe('TestContract1')

      deploymentEvents.off('event', eventListener)

      // But we should still be able to access artifacts by their paths
      const artifact1ByPath = registry.lookup(path.join(tempDir, 'contract1.json'))
      expect(artifact1ByPath).toBeDefined()
      expect(artifact1ByPath!.contractName).toBe('TestContract1')

      const artifact2ByPath = registry.lookup(path.join(tempDir, 'duplicate-name.json'))
      expect(artifact2ByPath).toBeDefined()
      expect(artifact2ByPath!.contractName).toBe('TestContract1')
      expect(artifact2ByPath!.sourceName).toBe('contracts/DuplicateTestContract1.sol')
    })
  })

  describe('integration tests', () => {
    it('should handle complete workflow: load, add, lookup', async () => {
      const tempDir = await createTempDir()
      
      // Load initial artifacts
      await copyFixture('contract1.json', path.join(tempDir, 'contract1.json'))
      await registry.loadFrom(tempDir)

      // Add artifact manually
      const manualArtifact: Artifact = {
        contractName: 'ManualContract',
        abi: [],
        bytecode: '0x999',
        _path: '/manual/path.json',
        _hash: 'manualhash'
      }
      registry.add(manualArtifact)

      // Verify both loaded and manual artifacts are accessible
      expect(registry.lookup('TestContract1')).toBeDefined()
      expect(registry.lookup('ManualContract')).toBeDefined()
      expect(registry.lookup('manualhash')).toBeDefined()
    })

    it('should handle empty directory', async () => {
      const tempDir = await createTempDir()
      
      await registry.loadFrom(tempDir)

      // Should not throw and should have no artifacts
      expect(registry.lookup('AnyContract')).toBeUndefined()
    })

    it('should load contracts from build-info files', async () => {
      const tempDir = await createTempDir()
      
      // Copy a build-info fixture
      const buildInfoPath = path.join(tempDir, 'artifacts', 'build-info', 'test.json')
      const buildInfoFixturePath = path.join(__dirname, '../../parsers/__tests__/fixtures/buildinfo/multi-contract-buildinfo.json')
      await fs.promises.mkdir(path.dirname(buildInfoPath), { recursive: true })
      await fs.promises.copyFile(buildInfoFixturePath, buildInfoPath)
      
      await registry.loadFrom(tempDir)

      // Should load both contracts from the build-info
      const token = registry.lookup('Token')
      const factory = registry.lookup('TokenFactory')
      
      expect(token).toBeDefined()
      expect(token!.contractName).toBe('Token')
      expect(token!.sourceName).toBe('src/Token.sol')
      expect(token!._path).toContain('#src/Token.sol:Token')
      
      expect(factory).toBeDefined()
      expect(factory!.contractName).toBe('TokenFactory')
      expect(factory!.sourceName).toBe('src/TokenFactory.sol')
      expect(factory!._path).toContain('#src/TokenFactory.sol:TokenFactory')

      // Should have 2 total artifacts
      expect(registry.getAll()).toHaveLength(2)
    })
  })
}) 