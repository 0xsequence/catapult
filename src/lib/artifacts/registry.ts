import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash } from 'crypto'
import { parseArtifact } from '../parsers/artifact'
import { Artifact } from '../types'

export class ArtifactRegistry {
  private artifacts: Artifact[] = []
  private byName: Map<string, Artifact> = new Map()
  private byHash: Map<string, Artifact> = new Map()
  private byPath: Map<string, Artifact> = new Map()

  /**
   * Recursively scans a directory for artifact files, parses them, and adds them to the registry.
   * @param projectRoot The root directory to start scanning from.
   */
  public async loadFrom(projectRoot: string): Promise<void> {
    const files = await this.findArtifactFiles(projectRoot)
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
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

    // Populate lookup maps, handling potential collisions.
    if (this.byName.has(artifact.contractName)) {
      console.warn(`Warning: Duplicate artifact contractName found: "${artifact.contractName}". Overwriting with artifact from ${artifact._path}.`)
    }
    this.byName.set(artifact.contractName, artifact)

    if (this.byHash.has(artifact._hash)) {
      // This can happen if the same artifact file is copied in multiple places. It's not necessarily an error.
    }
    this.byHash.set(artifact._hash, artifact)
    this.byPath.set(artifact._path, artifact)
  }

  /**
   * Finds an artifact in the registry using a flexible identifier.
   * The lookup order is: hash, name, then path.
   * @param identifier The identifier (hash, name, or path) to look for.
   * @returns The found Artifact, or undefined.
   */
  public lookup(identifier: string): Artifact | undefined {
    // 1. Try to match by full hash
    if (this.byHash.has(identifier)) {
      return this.byHash.get(identifier)
    }

    // 2. Try to match by contractName. This is how `{{creationCode(sequence/v1/factory)}}` works.
    if (this.byName.has(identifier)) {
      return this.byName.get(identifier)
    }

    // 3. Try to match by the full absolute path
    if (this.byPath.has(identifier)) {
        return this.byPath.get(identifier)
    }

    // 4. Try to match by a partial path suffix.
    for (const artifact of this.artifacts) {
        if (artifact._path.endsWith(identifier)) {
            return artifact
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