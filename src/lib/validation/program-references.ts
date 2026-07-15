import { ProjectLoader } from '../core/loader'

export interface UsedProgramReference {
  reference: string
  location: string
}

export interface MissingProgramReference extends UsedProgramReference {}

type LocatedProgramReference = UsedProgramReference & { contextPath?: string }

export function extractUsedProgramReferences(loader: ProjectLoader): UsedProgramReference[] {
  return collectProgramReferences(loader).map(({ reference, location }) => ({ reference, location }))
}

export function validateProgramReferences(loader: ProjectLoader): MissingProgramReference[] {
  const missing: MissingProgramReference[] = []
  for (const item of collectProgramReferences(loader)) {
    if (!loader.programRepository.lookup(item.reference, item.contextPath)) {
      missing.push({ reference: item.reference, location: item.location })
    }
  }
  return missing
}

function collectProgramReferences(loader: ProjectLoader): LocatedProgramReference[] {
  const result: LocatedProgramReference[] = []
  for (const [jobName, job] of loader.jobs) {
    collectActions(job.actions, `job '${jobName}'`, job._path, result)
  }
  for (const [templateName, template] of loader.templates) {
    collectActions(template.actions, `template '${templateName}'`, template._path, result)
    if (template.setup?.actions) {
      collectActions(template.setup.actions, `template '${templateName}' setup`, template._path, result)
    }
    if (template.outputs) {
      collectValue(template.outputs, `template '${templateName}' outputs`, template._path, result)
    }
  }
  return result
}

function collectActions(
  actions: Array<{ name?: string; arguments: unknown }>,
  locationPrefix: string,
  contextPath: string | undefined,
  result: LocatedProgramReference[]
): void {
  actions.forEach((action, index) => {
    const location = `${locationPrefix}, action ${index + 1}${action.name ? ` '${action.name}'` : ''}`
    collectValue(action.arguments, location, contextPath, result)
  })
}

function collectValue(
  value: unknown,
  location: string,
  contextPath: string | undefined,
  result: LocatedProgramReference[]
): void {
  if (typeof value === 'string') {
    const match = value.match(/^{{Program\((.*?)\)(?:\.\w+)?}}$/)
    if (!match) return
    const reference = match[1].trim()
    result.push({
      reference,
      location: `${location}, Program(${reference})`,
      contextPath,
    })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectValue(item, `${location}[${index}]`, contextPath, result))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collectValue(item, `${location}.${key}`, contextPath, result)
    }
  }
}
