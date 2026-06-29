import * as fs from 'fs/promises'
import * as path from 'path'
import { ContractRepository } from '../repository'

function buildInfoContent(): string {
  return JSON.stringify({
    _format: 'hh-sol-build-info-1',
    id: 'test-build-id',
    solcVersion: '0.8.0',
    solcLongVersion: '0.8.0+commit.c7dfd78e',
    input: {
      language: 'Solidity',
      sources: {
        'src/Stage1Module.sol': {
          content: 'contract Stage1Module {}'
        },
        'src/Stage2Module.sol': {
          content: 'contract Stage2Module {}'
        }
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode']
          }
        }
      }
    },
    output: {
      contracts: {
        'src/Stage1Module.sol': {
          Stage1Module: {
            abi: [],
            evm: {
              bytecode: {
                object: '0x608060405234801561001057600080fd5b50111111'
              },
              deployedBytecode: {
                object: '0x608060405234801561001057600080fd5b50111112'
              }
            }
          }
        },
        'src/Stage2Module.sol': {
          Stage2Module: {
            abi: [],
            evm: {
              bytecode: {
                object: '0x608060405234801561001057600080fd5b50222222'
              },
              deployedBytecode: {
                object: '0x608060405234801561001057600080fd5b50222223'
              }
            }
          }
        }
      },
      sources: {}
    }
  })
}

describe('ContractRepository', () => {
  let repository: ContractRepository
  let tempDir: string

  beforeEach(async () => {
    repository = new ContractRepository()
    
    // Create a temporary directory for test files
    tempDir = path.join(__dirname, 'temp-test-files')
    await fs.mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch (error) {
      // Ignore cleanup errors
    }
  })

  describe('loadFrom method', () => {
    it('should find and load standard artifact files', async () => {
      const artifactContent = JSON.stringify({
        contractName: 'TestContract',
        abi: [{ type: 'function', name: 'test' }],
        bytecode: '0x608060405234801561001057600080fd5b50',
        deployedBytecode: '0x608060405234801561001057600080fd5b506004361061003957600080fd5b50'
      })

      const artifactPath = path.join(tempDir, 'TestContract.json')
      await fs.writeFile(artifactPath, artifactContent)

      await repository.loadFrom(tempDir)

      const contracts = repository.getAll()
      expect(contracts).toHaveLength(1)

      const contract = contracts[0]
      expect(contract.contractName).toBe('TestContract')
      expect(contract.creationCode).toBe('0x608060405234801561001057600080fd5b50')
      expect(contract.runtimeBytecode).toBe('0x608060405234801561001057600080fd5b506004361061003957600080fd5b50')
      expect(contract.abi).toEqual([{ type: 'function', name: 'test' }])
      expect(contract._sources.has(artifactPath)).toBe(true)
    })

    it('should find and load build-info files', async () => {
      const buildInfoContent = JSON.stringify({
        _format: 'hh-sol-build-info-1',
        id: 'test-build-id',
        solcVersion: '0.8.0',
        solcLongVersion: '0.8.0+commit.c7dfd78e',
        input: {
          language: 'Solidity',
          sources: {
            'src/TestContract.sol': {
              content: 'contract TestContract { function test() public {} }'
            }
          },
          settings: {
            outputSelection: {
              '*': {
                '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode']
              }
            }
          }
        },
        output: {
          contracts: {
            'src/TestContract.sol': {
              TestContract: {
                abi: [{ type: 'function', name: 'test' }],
                evm: {
                  bytecode: {
                    object: '0x608060405234801561001057600080fd5b50'
                  },
                  deployedBytecode: {
                    object: '0x608060405234801561001057600080fd5b506004361061003939600080fd5b50'
                  }
                }
              }
            }
          },
          sources: {}
        }
      })

      const buildInfoDir = path.join(tempDir, 'build-info')
      await fs.mkdir(buildInfoDir, { recursive: true })
      const buildInfoPath = path.join(buildInfoDir, 'test-buildinfo.json')
      await fs.writeFile(buildInfoPath, buildInfoContent)

      await repository.loadFrom(tempDir)

      const contracts = repository.getAll()
      expect(contracts).toHaveLength(1)

      const contract = contracts[0]
      expect(contract.contractName).toBe('TestContract')
      expect(contract.sourceName).toBe('src/TestContract.sol')
      expect(contract.creationCode).toBe('0x608060405234801561001057600080fd5b50')
      expect(contract.runtimeBytecode).toBe('0x608060405234801561001057600080fd5b506004361061003939600080fd5b50')
      expect(contract.abi).toEqual([{ type: 'function', name: 'test' }])
      expect(contract.buildInfoId).toBe('test-build-id')
      expect(contract.source).toBe('contract TestContract { function test() public {} }')
      expect(contract._sources.has(buildInfoPath)).toBe(true)
    })

    it('should attach source provenance from build-info sidecars', async () => {
      const buildInfoDir = path.join(tempDir, 'build-info', 'rc-5')
      await fs.mkdir(buildInfoDir, { recursive: true })
      const buildInfoPath = path.join(buildInfoDir, 'stage1.json')
      const sourcePath = path.join(buildInfoDir, 'source.yaml')

      await fs.writeFile(buildInfoPath, buildInfoContent())
      await fs.writeFile(sourcePath, `
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
    ref: "v3.0.0-rc.5"
    commit: "0d9061f229da73edae890e6fdd1fbf753028df6d"
    build: "forge build --build-info"
    contracts:
      "src/Stage1Module.sol:Stage1Module":
        ref: "stage1-special"
`)

      await repository.loadFrom(tempDir)

      const stage1 = repository.lookup(`${buildInfoPath}:Stage1Module`)
      const stage2 = repository.lookup(`${buildInfoPath}:Stage2Module`)

      expect(stage1).not.toBeNull()
      expect(stage2).not.toBeNull()

      expect(stage1!.sourceProvenance).toMatchObject({
        repo: 'https://github.com/0xsequence/wallet-contracts-v3',
        ref: 'stage1-special',
        commit: '0d9061f229da73edae890e6fdd1fbf753028df6d',
        build: 'forge build --build-info',
        sourceDocumentPath: sourcePath,
        buildInfoPath
      })
      expect(stage2!.sourceProvenance).toMatchObject({
        repo: 'https://github.com/0xsequence/wallet-contracts-v3',
        ref: 'v3.0.0-rc.5',
        commit: '0d9061f229da73edae890e6fdd1fbf753028df6d'
      })

      expect(stage1!._sourceProvenance?.get(buildInfoPath)?.ref).toBe('stage1-special')
    })

    it('should skip source sidecars that point to missing build-info files', async () => {
      const buildInfoDir = path.join(tempDir, 'build-info', 'rc-5')
      await fs.mkdir(buildInfoDir, { recursive: true })
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
      await fs.writeFile(path.join(buildInfoDir, 'source.yaml'), `
type: source
build_info:
  "./missing.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
`)

      try {
        await expect(repository.loadFrom(tempDir)).resolves.toBeUndefined()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does not exist'))
      } finally {
        warnSpy.mockRestore()
      }
    })

    it('should skip malformed source sidecars without blocking build-info loading', async () => {
      const buildInfoDir = path.join(tempDir, 'build-info', 'rc-5')
      await fs.mkdir(buildInfoDir, { recursive: true })
      const buildInfoPath = path.join(buildInfoDir, 'stage1.json')
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      await fs.writeFile(buildInfoPath, buildInfoContent())
      await fs.writeFile(path.join(buildInfoDir, 'source.yaml'), `
type: source
build_info:
  "./stage1.json":
    ref: "v3.0.0-rc.5"
`)

      try {
        await repository.loadFrom(tempDir)
      } finally {
        warnSpy.mockRestore()
      }

      const stage1 = repository.lookup(`${buildInfoPath}:Stage1Module`)
      expect(stage1).not.toBeNull()
      expect(stage1!.sourceProvenance).toBeUndefined()
    })

    it('should keep valid source sidecar entries when sibling entries are invalid', async () => {
      const buildInfoDir = path.join(tempDir, 'build-info', 'rc-5')
      await fs.mkdir(buildInfoDir, { recursive: true })
      const buildInfoPath = path.join(buildInfoDir, 'stage1.json')
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      await fs.writeFile(buildInfoPath, buildInfoContent())
      await fs.writeFile(path.join(buildInfoDir, 'source.yaml'), `
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
    commit: "0d9061f229da73edae890e6fdd1fbf753028df6d"
  "./bad.json":
    typo_field: true
`)

      try {
        await repository.loadFrom(tempDir)

        const stage1 = repository.lookup(`${buildInfoPath}:Stage1Module`)
        expect(stage1).not.toBeNull()
        expect(stage1!.sourceProvenance).toMatchObject({
          repo: 'https://github.com/0xsequence/wallet-contracts-v3',
          commit: '0d9061f229da73edae890e6fdd1fbf753028df6d'
        })
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('typo_field is not supported'))
      } finally {
        warnSpy.mockRestore()
      }
    })

    it('should skip source sidecar entries that do not point to build-info JSON', async () => {
      const buildInfoDir = path.join(tempDir, 'build-info', 'rc-5')
      await fs.mkdir(buildInfoDir, { recursive: true })
      const buildInfoPath = path.join(buildInfoDir, 'stage1.json')
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      await fs.writeFile(buildInfoPath, buildInfoContent())
      await fs.writeFile(path.join(buildInfoDir, 'source.yaml'), `
type: source
build_info:
  "./stage1.txt":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
`)

      try {
        await repository.loadFrom(tempDir)

        const stage1 = repository.lookup(`${buildInfoPath}:Stage1Module`)
        expect(stage1).not.toBeNull()
        expect(stage1!.sourceProvenance).toBeUndefined()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does not point to a build-info JSON file'))
      } finally {
        warnSpy.mockRestore()
      }
    })

    it('should skip duplicate source provenance entries for the same build-info file', async () => {
      const buildInfoDir = path.join(tempDir, 'build-info', 'rc-5')
      await fs.mkdir(buildInfoDir, { recursive: true })
      const buildInfoPath = path.join(buildInfoDir, 'stage1.json')
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

      await fs.writeFile(buildInfoPath, buildInfoContent())
      await fs.writeFile(path.join(buildInfoDir, 'source.yaml'), `
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3-a"
`)
      await fs.writeFile(path.join(buildInfoDir, 'source.yml'), `
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3-b"
`)

      try {
        await repository.loadFrom(tempDir)

        const stage1 = repository.lookup(`${buildInfoPath}:Stage1Module`)
        expect(stage1).not.toBeNull()
        expect(stage1!._sourceProvenance?.size).toBe(1)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate provenance'))
      } finally {
        warnSpy.mockRestore()
      }
    })

    it('should select preferred source provenance deterministically for duplicate bytecode', async () => {
      const olderBuildInfoDir = path.join(tempDir, 'build-info', 'b-release')
      const newerBuildInfoDir = path.join(tempDir, 'build-info', 'a-release')
      await fs.mkdir(olderBuildInfoDir, { recursive: true })
      await fs.mkdir(newerBuildInfoDir, { recursive: true })

      const olderBuildInfoPath = path.join(olderBuildInfoDir, 'stage1.json')
      const newerBuildInfoPath = path.join(newerBuildInfoDir, 'stage1.json')
      await fs.writeFile(olderBuildInfoPath, buildInfoContent())
      await fs.writeFile(newerBuildInfoPath, buildInfoContent())

      await fs.writeFile(path.join(olderBuildInfoDir, 'source.yaml'), `
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3-old"
`)
      await fs.writeFile(path.join(newerBuildInfoDir, 'source.yaml'), `
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3-new"
`)

      await repository.loadFrom(tempDir)

      const stage1 = repository.lookup(`${newerBuildInfoPath}:Stage1Module`)
      expect(stage1).not.toBeNull()
      expect(stage1!._sourceProvenance?.size).toBe(2)
      expect(stage1!.sourceProvenance?.repo).toBe('https://github.com/0xsequence/wallet-contracts-v3-new')
    })

    it('should hydrate contracts from multiple source files', async () => {
      // Create a basic artifact file (minimal info, will be hydrated by build-info)
      const artifactContent = JSON.stringify({
        contractName: 'TestContract',
        abi: [],
        bytecode: '0x608060405234801561001057600080fd5b50'
      })
      const artifactPath = path.join(tempDir, 'TestContract.json')
      await fs.writeFile(artifactPath, artifactContent)

      // Create a build-info file with the same bytecode but more complete information
      const buildInfoContent = JSON.stringify({
        _format: 'hh-sol-build-info-1',
        id: 'test-build-id',
        solcVersion: '0.8.0',
        solcLongVersion: '0.8.0+commit.c7dfd78e',
        input: {
          language: 'Solidity',
          sources: {
            'src/TestContract.sol': {
              content: 'contract TestContract { function test() public {} }'
            }
          },
          settings: {
            outputSelection: {
              '*': {
                '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode']
              }
            }
          }
        },
        output: {
          contracts: {
            'src/TestContract.sol': {
              TestContract: {
                abi: [{ type: 'function', name: 'test' }],
                evm: {
                  bytecode: {
                    object: '0x608060405234801561001057600080fd5b50'
                  },
                  deployedBytecode: {
                    object: '0x608060405234801561001057600080fd5b506004361061003939600080fd5b50'
                  }
                }
              }
            }
          },
          sources: {}
        }
      })

      const buildInfoDir = path.join(tempDir, 'build-info')
      await fs.mkdir(buildInfoDir, { recursive: true })
      const buildInfoPath = path.join(buildInfoDir, 'test-buildinfo.json')
      await fs.writeFile(buildInfoPath, buildInfoContent)

      await repository.loadFrom(tempDir)

      const contracts = repository.getAll()
      expect(contracts).toHaveLength(1)

      const contract = contracts[0]
      // Should have information from both sources
      expect(contract.contractName).toBe('TestContract')
      expect(contract.sourceName).toBe('src/TestContract.sol')
      expect(contract.abi).toEqual([{ type: 'function', name: 'test' }])
      expect(contract.buildInfoId).toBe('test-build-id')
      expect(contract.source).toBe('contract TestContract { function test() public {} }')
      expect(contract._sources.has(artifactPath)).toBe(true)
      expect(contract._sources.has(buildInfoPath)).toBe(true)
    })
  })

  describe('disambiguateReferences method', () => {
    beforeEach(async () => {
      // Create test files with deliberate name collisions
      const artifact1Content = JSON.stringify({
        contractName: 'MyToken',
        abi: [],
        bytecode: '0x608060405234801561001057600080fd5b50111111'
      })
      const artifact1Path = path.join(tempDir, 'contracts', 'MyToken.json')
      await fs.mkdir(path.dirname(artifact1Path), { recursive: true })
      await fs.writeFile(artifact1Path, artifact1Content)

      const artifact2Content = JSON.stringify({
        contractName: 'MyToken',
        abi: [],
        bytecode: '0x608060405234801561001057600080fd5b50222222'
      })
      const artifact2Path = path.join(tempDir, 'legacy', 'MyToken.json')
      await fs.mkdir(path.dirname(artifact2Path), { recursive: true })
      await fs.writeFile(artifact2Path, artifact2Content)

      await repository.loadFrom(tempDir)
    })

    it('should identify ambiguous references correctly', () => {
      const ambiguousRefs = repository.getAmbiguousReferences()
      expect(ambiguousRefs).toContain('MyToken')
    })

    it('should allow lookup by unique hash', () => {
      const contracts = repository.getAll()
      const contract1 = contracts.find(c => c.creationCode.includes('111111'))
      const contract2 = contracts.find(c => c.creationCode.includes('222222'))

      expect(contract1).toBeDefined()
      expect(contract2).toBeDefined()

      const lookupResult1 = repository.lookup(contract1!.uniqueHash)
      const lookupResult2 = repository.lookup(contract2!.uniqueHash)

      expect(lookupResult1).toBe(contract1)
      expect(lookupResult2).toBe(contract2)
    })

    it('should allow lookup by unambiguous path', () => {
      const contracts = repository.getAll()
      const contract1 = contracts.find(c => c.creationCode.includes('111111'))

      const lookupResult = repository.lookup(path.join(tempDir, 'contracts', 'MyToken.json'))
      expect(lookupResult).toBe(contract1)
    })
  })

  describe('lookup method', () => {
    beforeEach(async () => {
      const artifactContent = JSON.stringify({
        contractName: 'UniqueContract',
        abi: [{ type: 'function', name: 'test' }],
        bytecode: '0x608060405234801561001057600080fd5b50'
      })
      const artifactPath = path.join(tempDir, 'UniqueContract.json')
      await fs.writeFile(artifactPath, artifactContent)

      await repository.loadFrom(tempDir)
    })

    it('should successfully lookup by contract name', () => {
      const contract = repository.lookup('UniqueContract')
      expect(contract).not.toBeNull()
      expect(contract!.contractName).toBe('UniqueContract')
    })

    it('should successfully lookup by unique hash', () => {
      const contracts = repository.getAll()
      const testContract = contracts[0]
      
      const contract = repository.lookup(testContract.uniqueHash)
      expect(contract).toBe(testContract)
    })

    it('should successfully lookup by file path', () => {
      const artifactPath = path.join(tempDir, 'UniqueContract.json')
      const contract = repository.lookup(artifactPath)
      expect(contract).not.toBeNull()
      expect(contract!.contractName).toBe('UniqueContract')
    })

    it('should return null for non-existent references', () => {
      const contract = repository.lookup('NonExistentContract')
      expect(contract).toBeNull()
    })

    it('should throw error for ambiguous references', async () => {
      // Add another contract with the same name
      const artifact2Content = JSON.stringify({
        contractName: 'UniqueContract',
        abi: [],
        bytecode: '0x608060405234801561001057600080fd5b50222222'
      })
      const artifact2Path = path.join(tempDir, 'other', 'UniqueContract.json')
      await fs.mkdir(path.dirname(artifact2Path), { recursive: true })
      await fs.writeFile(artifact2Path, artifact2Content)

      // Reload to pick up the new file
      repository = new ContractRepository()
      await repository.loadFrom(tempDir)

      expect(() => {
        repository.lookup('UniqueContract')
      }).toThrow(/Ambiguous contract reference/)
    })
  })

  describe('edge cases', () => {
    it('should handle directories with no contract files', async () => {
      const emptyDir = path.join(tempDir, 'empty')
      await fs.mkdir(emptyDir, { recursive: true })

      await repository.loadFrom(emptyDir)

      const contracts = repository.getAll()
      expect(contracts).toHaveLength(0)
    })

    it('should ignore invalid JSON files', async () => {
      const invalidJsonPath = path.join(tempDir, 'invalid.json')
      await fs.writeFile(invalidJsonPath, 'invalid json content')

      const validArtifactContent = JSON.stringify({
        contractName: 'ValidContract',
        abi: [],
        bytecode: '0x608060405234801561001057600080fd5b50'
      })
      const validArtifactPath = path.join(tempDir, 'valid.json')
      await fs.writeFile(validArtifactPath, validArtifactContent)

      await repository.loadFrom(tempDir)

      const contracts = repository.getAll()
      expect(contracts).toHaveLength(1)
      expect(contracts[0].contractName).toBe('ValidContract')
    })

    it('should ignore files that are not artifacts or build-info', async () => {
      const nonArtifactContent = JSON.stringify({
        name: 'not an artifact',
        value: 'some data'
      })
      const nonArtifactPath = path.join(tempDir, 'notartifact.json')
      await fs.writeFile(nonArtifactPath, nonArtifactContent)

      await repository.loadFrom(tempDir)

      const contracts = repository.getAll()
      expect(contracts).toHaveLength(0)
    })
  })
})
