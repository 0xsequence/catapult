import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash } from 'crypto'
import { Contract } from '../types/contracts'
import { parseArtifact } from '../parsers/artifact'
import { parseBuildInfo, isBuildInfoFile } from '../parsers/buildinfo'

export class ContractRepository {
  private contracts: Map<string, Contract> = new Map()
  private referenceMap: Map<string, string[]> = new Map()
  private ambiguousReferences: Set<string> = new Set()

  /**
   * Main entry point that orchestrates the discovery and hydration process
   */
  public async loadFrom(projectRoot: string): Promise<void> {
    // Step 1: Discover all .json files
    const files = await this.findContractFiles(projectRoot)

    // Step 2: Parse and hydrate contracts from all discovered files
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        await this.parseAndHydrateFromFile(content, filePath)
      } catch (error) {
        // Silently ignore files that can't be read or parsed
      }
    }

    // Step 3: Build reference maps and identify ambiguous references
    this.disambiguateReferences()
  }

  /**
   * Parse a file as both artifact and build-info, then hydrate contracts
   */
  private async parseAndHydrateFromFile(content: string, filePath: string): Promise<void> {
    // Try parsing as build-info file first
    if (isBuildInfoFile(filePath)) {
      const extractedContracts = parseBuildInfo(content, filePath)
      if (extractedContracts) {
        for (const extracted of extractedContracts) {
          this.hydrateContract({
            creationCode: extracted.bytecode,
            runtimeBytecode: extracted.deployedBytecode,
            abi: extracted.abi,
            sourceName: extracted.sourceName,
            contractName: extracted.contractName,
            source: extracted.source,
            compiler: extracted.compiler,
            buildInfoId: extracted.buildInfoId,
          }, filePath)
        }
        return
      }
    }

    // Try parsing as regular artifact
    const parsed = parseArtifact(content, filePath)
    if (parsed) {
      this.hydrateContract({
        creationCode: parsed.bytecode,
        runtimeBytecode: parsed.deployedBytecode,
        abi: parsed.abi,
        sourceName: parsed.sourceName,
        contractName: parsed.contractName,
        source: parsed.source,
        compiler: parsed.compiler,
      }, filePath)
    }
  }

  /**
   * Hydrates a contract object with data from a source file
   */
  private hydrateContract(data: {
    creationCode: string
    runtimeBytecode?: string
    abi?: any[]
    sourceName?: string
    contractName?: string
    source?: string
    compiler?: any
    buildInfoId?: string
  }, sourceFilePath: string): void {
    // Validate that we have creation code for hashing (but allow empty string)
    if (data.creationCode === null || data.creationCode === undefined) {
      throw new Error(`Cannot hydrate contract from ${sourceFilePath}: missing creation code`)
    }
    
    // Calculate unique hash based on creation code
    const uniqueHash = createHash('sha256').update(data.creationCode).digest('hex')

    // Get existing contract or create new one
    let contract = this.contracts.get(uniqueHash)
    if (!contract) {
      contract = {
        uniqueHash,
        creationCode: data.creationCode,
        _sources: new Set<string>()
      }
      this.contracts.set(uniqueHash, contract)
    }

    // Add source file to tracking
    contract._sources.add(sourceFilePath)

    // Hydrate with new information - prefer more complete information
    // For build-info sources, prefer their data over artifact data
    const isFromBuildInfo = sourceFilePath.includes('/build-info/')
    
    if (data.runtimeBytecode && (!contract.runtimeBytecode || isFromBuildInfo)) {
      contract.runtimeBytecode = data.runtimeBytecode
    }
    if (data.abi && (!contract.abi || contract.abi.length === 0 || isFromBuildInfo)) {
      contract.abi = data.abi
    }
    if (data.sourceName && (!contract.sourceName || isFromBuildInfo)) {
      contract.sourceName = data.sourceName
    }
    if (data.contractName && (!contract.contractName || isFromBuildInfo)) {
      contract.contractName = data.contractName
    }
    if (data.source && (!contract.source || isFromBuildInfo)) {
      contract.source = data.source
    }
    if (data.compiler && (!contract.compiler || isFromBuildInfo)) {
      contract.compiler = data.compiler
    }
    if (data.buildInfoId && !contract.buildInfoId) {
      contract.buildInfoId = data.buildInfoId
    }
  }

  /**
   * Builds reference maps and identifies ambiguous references
   */
  public disambiguateReferences(): void {
    this.referenceMap.clear()
    this.ambiguousReferences.clear()

    // Build reference map
    for (const contract of this.contracts.values()) {
      const references: string[] = []

      // Add contract name reference
      if (contract.contractName) {
        references.push(contract.contractName)
      }

      // Add sourceName:contractName reference
      if (contract.sourceName && contract.contractName) {
        references.push(`${contract.sourceName}:${contract.contractName}`)
      }

      // Add file paths from sources (excluding build-info files since they can contain multiple contracts)
      for (const sourcePath of contract._sources) {
        // Skip build-info files as they legitimately contain multiple contracts
        if (!isBuildInfoFile(sourcePath)) {
          references.push(sourcePath)
          
          // Add relative paths (both forward and backward variants)
          const relativePath = path.relative(process.cwd(), sourcePath)
          if (relativePath !== sourcePath) {
            references.push(relativePath)
          }
        }
      }

      // For each reference, add the contract's uniqueHash to the reference map
      for (const ref of references) {
        if (!this.referenceMap.has(ref)) {
          this.referenceMap.set(ref, [])
        }
        if (!this.referenceMap.get(ref)!.includes(contract.uniqueHash)) {
          this.referenceMap.get(ref)!.push(contract.uniqueHash)
        }
      }
    }

    // Identify ambiguous references
    for (const [reference, hashes] of this.referenceMap.entries()) {
      if (hashes.length > 1) {
        this.ambiguousReferences.add(reference)
      }
    }
  }

  /**
   * Lookup a contract by reference
   * @param reference The contract reference string
   * @param contextPath Optional file path context for resolving relative paths
   */
  public lookup(reference: string, contextPath?: string): Contract | null {
    let resolvedReference = reference
    
    // Handle relative path resolution if contextPath is provided
    if (contextPath && (reference.startsWith('./') || reference.startsWith('../'))) {
      resolvedReference = path.resolve(path.dirname(contextPath), reference)
    }
    
    // Check if reference is ambiguous
    if (this.ambiguousReferences.has(resolvedReference)) {
      const hashes = this.referenceMap.get(resolvedReference) || []
      const conflictingSources = hashes.map(hash => {
        const contract = this.contracts.get(hash)
        return contract ? Array.from(contract._sources).join(', ') : 'unknown'
      })
      throw new Error(`Ambiguous contract reference "${resolvedReference}". Found in multiple contracts: ${conflictingSources.join(' | ')}`)
    }

    // Check if it's a direct unique hash
    if (this.contracts.has(resolvedReference)) {
      return this.contracts.get(resolvedReference)!
    }

    // Look up in reference map
    const hashes = this.referenceMap.get(resolvedReference)
    if (hashes && hashes.length === 1) {
      return this.contracts.get(hashes[0]) || null
    }

    return null
  }

  /**
   * Get all contracts in the repository
   */
  public getAll(): Contract[] {
    return Array.from(this.contracts.values())
  }

  /**
   * Get all ambiguous references
   */
  public getAmbiguousReferences(): string[] {
    return Array.from(this.ambiguousReferences)
  }

  /**
   * Add a contract directly to the repository (for testing purposes)
   * @param contractData - Contract data in the old Artifact format for compatibility
   */
  public addForTesting(contractData: {
    contractName: string
    abi: any[]
    bytecode: string
    deployedBytecode?: string
    sourceName?: string
    source?: string
    compiler?: any
    buildInfoId?: string
    _path: string
    _hash: string
  }): void {
    this.hydrateContract({
      creationCode: contractData.bytecode,
      runtimeBytecode: contractData.deployedBytecode,
      abi: contractData.abi,
      sourceName: contractData.sourceName,
      contractName: contractData.contractName,
      source: contractData.source,
      compiler: contractData.compiler,
      buildInfoId: contractData.buildInfoId,
    }, contractData._path)

    // For testing, immediately disambiguate references after adding
    this.disambiguateReferences()
  }

  /**
   * Recursively finds all files that might contain contracts (e.g., .json files)
   */
  private async findContractFiles(dir: string, ignoreDirs: Set<string> = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])): Promise<string[]> {
    let results: string[] = []
    try {
      const list = await fs.readdir(dir, { withFileTypes: true })

      for (const dirent of list) {
        const fullPath = path.resolve(dir, dirent.name)
        if (dirent.isDirectory()) {
          if (!ignoreDirs.has(dirent.name)) {
            results = results.concat(await this.findContractFiles(fullPath, ignoreDirs))
          }
        } else if (dirent.isFile() && dirent.name.endsWith('.json')) {
          results.push(fullPath)
        }
      }
    } catch (err) {
      // Ignore errors from trying to read directories we don't have access to
    }
    return results
  }
}