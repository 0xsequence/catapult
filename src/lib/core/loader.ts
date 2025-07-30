import * as fs from 'fs/promises'
import * as path from 'path'
import { parseJob, parseTemplate } from '../parsers'
import { Job, Template } from '../types'
import { ContractRepository } from '../contracts/repository'

export interface ProjectLoaderOptions {
  loadStdTemplates?: boolean
}

export class ProjectLoader {
  public jobs: Map<string, Job> = new Map()
  public templates: Map<string, Template> = new Map()
  public readonly contractRepository: ContractRepository

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



  private async pathExists(p: string): Promise<boolean> {
      try {
          await fs.access(p)
          return true
      } catch {
          return false
      }
  }
}