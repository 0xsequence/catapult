import * as fs from 'fs/promises'
import * as path from 'path'
import { parseJob, parseTemplate } from '../parsers'
import { Job, Template } from '../types'
import { ArtifactRegistry } from '../artifacts/registry'

export class ProjectLoader {
  public jobs: Map<string, Job> = new Map()
  public templates: Map<string, Template> = new Map()
  public readonly artifactRegistry: ArtifactRegistry

  constructor(private readonly projectRoot: string) {
    this.artifactRegistry = new ArtifactRegistry()
  }

  async load() {
    // Load all artifacts from the project root first.
    await this.artifactRegistry.loadFrom(this.projectRoot)

    // Load standard library templates
    const stdTemplatePath = path.resolve(__dirname, '..', 'std', 'templates')
    await this.loadTemplatesFromDir(stdTemplatePath)
    
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

  private async pathExists(p: string): Promise<boolean> {
      try {
          await fs.access(p)
          return true
      } catch {
          return false
      }
  }
}