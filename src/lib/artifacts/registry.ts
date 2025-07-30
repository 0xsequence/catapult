import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash } from 'crypto'
import { parseArtifact } from '../parsers/artifact'
import { parseBuildInfo, isBuildInfoFile, extractedContractToArtifact } from '../parsers/buildinfo'
import { Artifact, BuildInfo } from '../types'
import { deploymentEvents } from '../events'

export interface BuildInfoEntry {
  filePath: string
  buildInfo: BuildInfo
  hash: string
  extractedContracts: string[] // Contract names extracted from this build-info
}

export class ArtifactRegistry {
  private artifacts: Artifact[] = []
  private byName: Map<string, Artifact> = new Map()
  private byHash: Map<string, Artifact> = new Map()
  private byPath: Map<string, Artifact> = new Map()
  private duplicateNames: Set<string> = new Set()
  private buildInfos: BuildInfoEntry[] = []
  private projectRoot?: string

  /**
   * Recursively scans a directory for artifact files, parses them, and adds them to the registry.
   * @param projectRoot The root directory to start scanning from.
   */
  public async loadFrom(projectRoot: string): Promise<void> {
    this.projectRoot = projectRoot
    const files = await this.findArtifactFiles(projectRoot)
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        
        // Check if this is a build-info file
        if (isBuildInfoFile(filePath)) {
          const extractedContracts = parseBuildInfo(content, filePath)
          if (extractedContracts) {
            // Parse the build-info content to get the BuildInfo object
            const buildInfo = JSON.parse(content) as BuildInfo
            const hash = createHash('md5').update(content).digest('hex')
            
            // Track the build-info file
            const extractedContractNames = extractedContracts.map(contract => contract.contractName)
            this.buildInfos.push({
              filePath,
              buildInfo,
              hash,
              extractedContracts: extractedContractNames
            })
            
            // Create an artifact for each extracted contract
            for (const extracted of extractedContracts) {
              // Create a unique path identifier for each contract within the build-info
              const contractPath = `${filePath}#${extracted.fullyQualifiedName}`
              const artifactHash = createHash('md5').update(content + extracted.fullyQualifiedName).digest('hex')
              
              const artifact: Artifact = {
                ...extractedContractToArtifact(extracted),
                _path: contractPath,
                _hash: artifactHash,
              }
              this.add(artifact)
            }
          }
        } else {
          // Handle regular artifact files
          const parsed = parseArtifact(content, filePath)
          if (parsed) {
            const hash = createHash('md5').update(content).digest('hex')
            const artifact: Artifact = {
              ...parsed,
              _path: filePath,
              _hash: hash,
            }
            this.add(artifact)
          }
        }
      } catch (error) {
        // Silently ignore files that can't be read or parsed, as they may not be artifacts
      }
    }
  }

  /**
   * Adds a single artifact to the registry and populates the lookup maps.
   * @param artifact The artifact to add.
   */
  public add(artifact: Artifact): void {
    this.artifacts.push(artifact)

    // Check for duplicate names and track them
    if (this.byName.has(artifact.contractName)) {
      // Mark this contract name as having duplicates
      this.duplicateNames.add(artifact.contractName)
    }
    this.byName.set(artifact.contractName, artifact)

    if (this.byHash.has(artifact._hash)) {
      // This can happen if the same artifact file is copied in multiple places. It's not necessarily an error.
    }
    this.byHash.set(artifact._hash, artifact)
    this.byPath.set(artifact._path, artifact)
  }

  /**
   * Returns a read-only list of all registered artifacts.
   */
  public getAll(): readonly Artifact[] {
    return this.artifacts
  }

  /**
   * Returns a read-only list of all registered build-info files.
   */
  public getBuildInfos(): readonly BuildInfoEntry[] {
    return this.buildInfos
  }

  /**
   * Finds an artifact in the registry using a flexible identifier.
   * The lookup order is: hash, name (unless duplicate), then path.
   * Supports relative paths that are resolved against the project root.
   * @param identifier The identifier (hash, name, or path) to look for.
   * @returns The found Artifact, or undefined.
   */
  public lookup(identifier: string): Artifact | undefined {
    return this.lookupWithContext(identifier)
  }

  /**
   * Finds an artifact in the registry using a flexible identifier with context.
   * The lookup order is: hash, name (unless duplicate), then path.
   * Supports relative paths that are resolved against the context path or project root.
   * @param identifier The identifier (hash, name, or path) to look for.
   * @param contextPath Optional context path for resolving relative paths (e.g., job file path).
   * @returns The found Artifact, or undefined.
   */
  public lookupWithContext(identifier: string, contextPath?: string): Artifact | undefined {
    // 0. Handle relative paths - resolve against context path if available, otherwise project root
    if (identifier.startsWith('./') || identifier.startsWith('../')) {
      if (contextPath) {
        // Resolve relative to the directory containing the context file
        const contextDir = path.dirname(contextPath)
        const resolvedPath = path.resolve(contextDir, identifier)
        if (this.byPath.has(resolvedPath)) {
          return this.byPath.get(resolvedPath)
        }
      } else if (this.projectRoot) {
        // Fallback to project root resolution
        const resolvedPath = path.resolve(this.projectRoot, identifier)
        if (this.byPath.has(resolvedPath)) {
          return this.byPath.get(resolvedPath)
        }
      }
    }

    // 1. Try to match by full hash
    if (this.byHash.has(identifier)) {
      return this.byHash.get(identifier)
    }

    // 2. Try to match by contractName, but only if it's not a duplicate name
    if (this.byName.has(identifier)) {
      if (this.duplicateNames.has(identifier)) {
        // Emit warning only when someone tries to use a duplicate name
        deploymentEvents.emitEvent({
          type: 'duplicate_artifact_warning',
          level: 'warn',
          data: {
            contractName: identifier,
            path: '' // We don't have a specific path in this context
          }
        })
        return undefined
      }
      return this.byName.get(identifier)
    }

    // 3. Try to match by the full absolute path
    if (this.byPath.has(identifier)) {
        return this.byPath.get(identifier)
    }

    // 4. Try to match by a partial path suffix.
    if (identifier) { // Only check if identifier is not empty
        for (const artifact of this.artifacts) {
            if (artifact._path.endsWith(identifier)) {
                return artifact
            }
        }
    }

    return undefined
  }

  /**
   * Recursively finds all files that might be artifacts (e.g., .json files).
   */
  private async findArtifactFiles(dir: string, ignoreDirs: Set<string> = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])): Promise<string[]> {
    let results: string[] = []
    try {
        const list = await fs.readdir(dir, { withFileTypes: true })

        for (const dirent of list) {
          const fullPath = path.resolve(dir, dirent.name)
          if (dirent.isDirectory()) {
            if (!ignoreDirs.has(dirent.name)) {
              results = results.concat(await this.findArtifactFiles(fullPath, ignoreDirs))
            }
          } else if (dirent.isFile() && dirent.name.endsWith('.json')) { // For now, only look for .json
            results.push(fullPath)
          }
        }
    } catch (err) {
        // Ignore errors from trying to read directories we don't have access to, etc.
    }
    return results
  }
}