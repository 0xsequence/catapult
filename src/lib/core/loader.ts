import * as fs from 'fs/promises'
import * as path from 'path'
import { parseJob, parseTemplate } from '../parsers'
import { Job, Template } from '../types'
import { ArtifactRegistry } from '../artifacts/registry'
import { ArtifactReferenceValidator, ArtifactReferenceError } from '../validation/artifact-references'

export interface ProjectLoaderOptions {
  loadStdTemplates?: boolean
}

export class ProjectLoader {
  public jobs: Map<string, Job> = new Map()
  public templates: Map<string, Template> = new Map()
  public readonly artifactRegistry: ArtifactRegistry

  constructor(
    private readonly projectRoot: string,
    private readonly options: ProjectLoaderOptions = {}
  ) {
    this.artifactRegistry = new ArtifactRegistry()
  }

  async load() {
    // Load all artifacts from the project root first.
    await this.artifactRegistry.loadFrom(this.projectRoot)

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
    const files = await fs.readdir(dir)
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8')
        const template = parseTemplate(content)
        this.templates.set(template.name, template)
      }
    }
  }

  private async loadJobsFromDir(dir: string) {
    // Similar to loadTemplatesFromDir, but calls parseJob
    const files = await fs.readdir(dir)
    for (const file of files) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const content = await fs.readFile(path.join(dir, file), 'utf-8')
        const job = parseJob(content)
        this.jobs.set(job.name, job)
      }
    }
  }

  /**
   * Validates that all artifact references in jobs and templates exist in the registry.
   * @returns Array of validation errors (empty if all references are valid)
   */
  public validateArtifactReferences(): ArtifactReferenceError[] {
    const validator = new ArtifactReferenceValidator(this.artifactRegistry)
    return validator.validateAll(this.jobs, this.templates)
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