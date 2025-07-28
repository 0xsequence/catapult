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

    it('should handle duplicate contract names and show warning', () => {
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

      // Check that the duplicate warning event was emitted
      const warningEvent = emittedEvents.find(e => e.type === 'duplicate_artifact_warning')
      expect(warningEvent).toBeDefined()
      expect(warningEvent.data.contractName).toBe('DuplicateName')
      expect(warningEvent.data.path).toBe('/test/path2.json')

      // Should return the second one (last added)
      const found = registry.lookup('DuplicateName')
      expect(found!._path).toBe('/test/path2.json')

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

      // Check that the duplicate warning event was emitted
      const warningEvent = emittedEvents.find(e => e.type === 'duplicate_artifact_warning')
      expect(warningEvent).toBeDefined()
      expect(warningEvent.data.contractName).toBe('TestContract1')

      deploymentEvents.off('event', eventListener)

      // Should have the last loaded one
      const artifact = registry.lookup('TestContract1')
      expect(artifact).toBeDefined()
      expect(artifact!.sourceName).toBe('contracts/DuplicateTestContract1.sol')


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
  })
}) 