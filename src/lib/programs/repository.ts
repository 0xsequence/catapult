import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash } from 'crypto'
import { SvmProgram } from '../types/programs'

type IdlCandidate = {
  name: string
  path: string
  value: Record<string, unknown>
}

export class SvmProgramRepository {
  private readonly programs = new Map<string, SvmProgram>()
  private readonly references = new Map<string, string[]>()
  private readonly ambiguousReferences = new Set<string>()

  public async loadFrom(projectRoot: string): Promise<void> {
    this.programs.clear()
    this.references.clear()
    this.ambiguousReferences.clear()

    const files = await this.findFiles(projectRoot)
    const idls = await this.loadIdls(files.jsonFiles)

    for (const binaryPath of files.binaryFiles) {
      const bytes = await fs.readFile(binaryPath)
      const uniqueHash = createHash('sha256').update(bytes).digest('hex')
      const name = path.basename(binaryPath, '.so')
      const idl = idls.find(candidate => candidate.name === name)
      this.programs.set(uniqueHash, {
        platform: 'svm',
        name,
        uniqueHash,
        binaryPath,
        byteLength: bytes.length,
        idl: idl?.value,
        idlPath: idl?.path,
      })
    }

    this.buildReferences(projectRoot)
  }

  public lookup(reference: string, contextPath?: string): SvmProgram | null {
    let resolved = reference
    if (contextPath && (reference.startsWith('./') || reference.startsWith('../'))) {
      resolved = path.resolve(path.dirname(contextPath), reference)
    }

    if (this.programs.has(resolved)) {
      return this.programs.get(resolved)!
    }

    if (this.ambiguousReferences.has(resolved)) {
      const matches = this.references.get(resolved) || []
      throw new Error(`Ambiguous SVM program reference "${reference}": ${matches.join(', ')}`)
    }

    const matches = this.references.get(resolved)
    return matches?.length === 1 ? this.programs.get(matches[0]) || null : null
  }

  public getAll(): SvmProgram[] {
    return Array.from(this.programs.values())
  }

  public getAmbiguousReferences(): string[] {
    return Array.from(this.ambiguousReferences)
  }

  private buildReferences(projectRoot: string): void {
    for (const program of this.programs.values()) {
      const refs = new Set([
        program.name,
        `${program.name}.so`,
        program.binaryPath,
        path.relative(projectRoot, program.binaryPath),
        path.relative(process.cwd(), program.binaryPath),
      ])
      for (const reference of refs) {
        const hashes = this.references.get(reference) || []
        if (!hashes.includes(program.uniqueHash)) hashes.push(program.uniqueHash)
        this.references.set(reference, hashes)
      }
    }

    for (const [reference, hashes] of this.references) {
      if (hashes.length > 1) this.ambiguousReferences.add(reference)
    }
  }

  private async loadIdls(jsonFiles: string[]): Promise<IdlCandidate[]> {
    const result: IdlCandidate[] = []
    for (const filePath of jsonFiles) {
      try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>
        if (!parsed || !Array.isArray(parsed.instructions)) continue
        const metadata = parsed.metadata && typeof parsed.metadata === 'object'
          ? parsed.metadata as Record<string, unknown>
          : undefined
        const name = typeof metadata?.name === 'string'
          ? metadata.name
          : (typeof parsed.name === 'string' ? parsed.name : path.basename(filePath, '.json'))
        result.push({ name, path: filePath, value: parsed })
      } catch {
        // Non-IDL JSON files are expected in Catapult projects.
      }
    }
    return result
  }

  private async findFiles(
    dir: string,
    ignored = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])
  ): Promise<{ binaryFiles: string[]; jsonFiles: string[] }> {
    const result = { binaryFiles: [] as string[], jsonFiles: [] as string[] }
    try {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const fullPath = path.resolve(dir, entry.name)
        if (entry.isDirectory() && !ignored.has(entry.name)) {
          const child = await this.findFiles(fullPath, ignored)
          result.binaryFiles.push(...child.binaryFiles)
          result.jsonFiles.push(...child.jsonFiles)
        } else if (entry.isFile() && entry.name.endsWith('.so')) {
          result.binaryFiles.push(fullPath)
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          result.jsonFiles.push(fullPath)
        }
      }
    } catch {
      // Match ContractRepository's tolerant project discovery behavior.
    }
    return result
  }
}
