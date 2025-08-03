import * as fs from 'fs/promises'
import * as path from 'path'
import { parseJob, parseTemplate } from '../parsers'
import { Job, Template } from '../types'
import { ContractRepository } from '../contracts/repository'
import { parseConstants } from '../parsers/constants'

export interface ProjectLoaderOptions {
  loadStdTemplates?: boolean
}

export class ProjectLoader {
  public jobs: Map<string, Job> = new Map()
  public templates: Map<string, Template> = new Map()
  public readonly contractRepository: ContractRepository

  // Top-level constants registry
  public constants: Map<string, any> = new Map()
  // Track source files for constants for duplicate reporting
  private constantSources: Map<string, string> = new Map()

  constructor(
    private readonly projectRoot: string,
    private readonly options: ProjectLoaderOptions = {}
  ) {
    this.contractRepository = new ContractRepository()
  }

  async load() {
    // Load all contracts from the project root first
    await this.contractRepository.loadFrom(this.projectRoot)

    // Load standard library templates (unless disabled)
    if (this.options.loadStdTemplates !== false) {
      const stdTemplatePath = path.resolve(__dirname, '..', 'std', 'templates')
      if (await this.pathExists(stdTemplatePath)) {
        await this.loadTemplatesFromDir(stdTemplatePath)
      }
    }
    
    // Load user-defined templates
    const userTemplatePath = path.join(this.projectRoot, 'templates')
    if (await this.pathExists(userTemplatePath)) {
        await this.loadTemplatesFromDir(userTemplatePath)
    }

    // Load jobs
    const jobsPath = path.join(this.projectRoot, 'jobs')
    if (await this.pathExists(jobsPath)) {
        await this.loadJobsFromDir(jobsPath)
    }

    // Load templates from within job directories
    if (await this.pathExists(jobsPath)) {
        await this.loadTemplatesFromJobDirs(jobsPath)
    }

    // Load top-level constants from anywhere in project root
    await this.loadConstantsFromDir(this.projectRoot)
  }

  private async loadTemplatesFromDir(dir: string) {
    const templateFiles = await this.findTemplateFiles(dir)
    for (const filePath of templateFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const template = parseTemplate(content)
        template._path = filePath
        this.templates.set(template.name, template)
      } catch (error) {
        // Silently ignore files that can't be read or parsed, as they may not be template files
      }
    }
  }

  /**
   * Recursively finds all template files (.yaml/.yml) in a directory.
   */
  private async findTemplateFiles(dir: string, ignoreDirs: Set<string> = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])): Promise<string[]> {
    let results: string[] = []
    try {
      const list = await fs.readdir(dir, { withFileTypes: true })

      for (const dirent of list) {
        const fullPath = path.resolve(dir, dirent.name)
        if (dirent.isDirectory()) {
          if (!ignoreDirs.has(dirent.name)) {
            results = results.concat(await this.findTemplateFiles(fullPath, ignoreDirs))
          }
        } else if (dirent.isFile() && (dirent.name.endsWith('.yaml') || dirent.name.endsWith('.yml'))) {
          results.push(fullPath)
        }
      }
    } catch (err) {
      // Ignore errors from trying to read directories we don't have access to, etc.
    }
    return results
  }

  private async loadJobsFromDir(dir: string) {
    const jobFiles = await this.findJobFiles(dir)
    for (const filePath of jobFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const job = parseJob(content)
        // Capture optional job-level constants by peeking the raw YAML for "constants"
        try {
          const raw = JSON.parse(JSON.stringify(require('yaml').parse(content)))
          if (raw && typeof raw === 'object' && raw.constants !== undefined) {
            if (typeof raw.constants !== 'object' || Array.isArray(raw.constants)) {
              throw new Error(`Invalid job "${job.name}": "constants" field must be an object if provided.`)
            }
            (job as any).constants = raw.constants
          }
        } catch {
          // If YAML parse for constants peek fails here, ignore (parseJob already validated YAML for job)
        }
        job._path = filePath
        this.jobs.set(job.name, job)
      } catch (error) {
        // Silently ignore files that can't be read or parsed, as they may not be job files
      }
    }
  }

  /**
   * Recursively finds all job files (.yaml/.yml) in a directory.
   */
  private async findJobFiles(dir: string, ignoreDirs: Set<string> = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])): Promise<string[]> {
    let results: string[] = []
    try {
      const list = await fs.readdir(dir, { withFileTypes: true })

      for (const dirent of list) {
        const fullPath = path.resolve(dir, dirent.name)
        if (dirent.isDirectory()) {
          if (!ignoreDirs.has(dirent.name)) {
            results = results.concat(await this.findJobFiles(fullPath, ignoreDirs))
          }
        } else if (dirent.isFile() && (dirent.name.endsWith('.yaml') || dirent.name.endsWith('.yml'))) {
          results.push(fullPath)
        }
      }
    } catch (err) {
      // Ignore errors from trying to read directories we don't have access to, etc.
    }
    return results
  }

  /**
   * Loads templates from within job directories by scanning for 'templates' subdirectories.
   */
  private async loadTemplatesFromJobDirs(jobsRootDir: string) {
    await this.findAndLoadTemplatesInJobDirs(jobsRootDir)
  }

  /**
   * Recursively searches for 'templates' directories within job directories and loads templates from them.
   */
  private async findAndLoadTemplatesInJobDirs(dir: string, ignoreDirs: Set<string> = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])): Promise<void> {
    try {
      const list = await fs.readdir(dir, { withFileTypes: true })

      for (const dirent of list) {
        const fullPath = path.resolve(dir, dirent.name)
        if (dirent.isDirectory()) {
          if (!ignoreDirs.has(dirent.name)) {
            // If this directory is named 'templates', load templates from it
            if (dirent.name === 'templates') {
              await this.loadTemplatesFromDir(fullPath)
            }
            // Continue recursively searching for more template directories
            await this.findAndLoadTemplatesInJobDirs(fullPath, ignoreDirs)
          }
        }
      }
    } catch (err) {
      // Ignore errors from trying to read directories we don't have access to, etc.
    }
  }

  /**
   * Load and merge all top-level constants from any YAML file with type: "constants"
   * located anywhere under the given directory.
   */
  private async loadConstantsFromDir(dir: string, ignoreDirs: Set<string> = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])): Promise<void> {
    try {
      const list = await fs.readdir(dir, { withFileTypes: true })
      for (const dirent of list) {
        const fullPath = path.resolve(dir, dirent.name)
        if (dirent.isDirectory()) {
          if (!ignoreDirs.has(dirent.name)) {
            await this.loadConstantsFromDir(fullPath, ignoreDirs)
          }
        } else if (dirent.isFile() && (dirent.name.endsWith('.yaml') || dirent.name.endsWith('.yml'))) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8')
            const constantsDoc = parseConstants(content)
            if (constantsDoc) {
              for (const [key, value] of Object.entries(constantsDoc.constants)) {
                if (this.constants.has(key)) {
                  const prevSource = this.constantSources.get(key)
                  throw new Error(`Duplicate constant "${key}" found in ${fullPath}${prevSource ? ` (previously defined in ${prevSource})` : ''}`)
                }
                this.constants.set(key, value)
                this.constantSources.set(key, fullPath)
              }
            }
          } catch (err) {
            // For constants files, surface parsing errors to fail fast
            if (err instanceof Error && err.message.startsWith('Failed to parse constants YAML:')) {
              throw err
            }
            // Otherwise, ignore if not a constants file
          }
        }
      }
    } catch (err) {
      // Ignore directory read errors
    }
  }

  private async pathExists(p: string): Promise<boolean> {
      try {
          await fs.access(p)
          return true
      } catch {
          return false
      }
  }
}