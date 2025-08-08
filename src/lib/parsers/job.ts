import { parse as parseYaml, YAMLParseError } from 'yaml'
import { Job, JobAction } from '../types'

/**
 * Parses a YAML string defining a job into a structured `Job` object.
 * This function validates the presence and basic types of required fields
 * for both the job and its nested actions.
 *
 * @param yamlContent The raw YAML content of the job file as a string.
 * @returns The parsed and validated `Job` object.
 * @throws {Error} If the YAML is malformed or if the job is missing required fields.
 */
export function parseJob(yamlContent: string): Job {
  let rawObject: any
  try {
    rawObject = parseYaml(yamlContent)
  } catch (e) {
    if (e instanceof YAMLParseError) {
      const line = e.linePos?.[0].line ? ` at line ${e.linePos[0].line}` : ''
      throw new Error(`Failed to parse job YAML: ${e.message}${line}.`)
    }
    throw e
  }

  if (!rawObject || typeof rawObject !== 'object') {
    throw new Error('Invalid job: YAML content must resolve to an object.')
  }

  // If a top-level discriminator exists and is not a job, bail out early with a helpful error
  if (rawObject.type && rawObject.type !== 'job') {
    throw new Error('Invalid job: unexpected type discriminator. Did you mean a template file with type: "template"?')
  }

  // --- Validate required top-level fields ---
  if (!rawObject.name || typeof rawObject.name !== 'string') {
    throw new Error('Invalid job: "name" field is required and must be a string.')
  }
  // The YAML parser may interpret a version like "1.0" as a number, so we ensure it's a string.
  if (!rawObject.version) {
    throw new Error(`Invalid job "${rawObject.name}": "version" field is required.`)
  }
  rawObject.version = String(rawObject.version)

  if (!rawObject.actions || !Array.isArray(rawObject.actions)) {
    throw new Error(`Invalid job "${rawObject.name}": "actions" field is required and must be an array.`)
  }

  // --- Validate each action within the job ---
  for (const action of rawObject.actions) {
    if (!action || typeof action !== 'object') {
      throw new Error(`Invalid job "${rawObject.name}": contains a non-object item in "actions" array.`)
    }
    if (!action.name || typeof action.name !== 'string') {
      throw new Error(`Invalid job "${rawObject.name}": an action is missing the required "name" field.`)
    }
    
    // Validate that the action has either a template or type field, but not both
    const hasTemplate = action.template && typeof action.template === 'string'
    const hasType = action.type && typeof action.type === 'string'
    
    if (!hasTemplate && !hasType) {
      throw new Error(`Invalid job "${rawObject.name}": action "${action.name}" must have either a "template" field (for template actions) or a "type" field (for primitive actions).`)
    }
    if (hasTemplate && hasType) {
      throw new Error(`Invalid job "${rawObject.name}": action "${action.name}" cannot have both "template" and "type" fields. Use only one.`)
    }
    
    if (!action.arguments || typeof action.arguments !== 'object' || Array.isArray(action.arguments)) {
      throw new Error(`Invalid job "${rawObject.name}": action "${action.name}" is missing the required "arguments" field or it is not an object.`)
    }
    
    // Validate the optional output field
    if (action.output !== undefined) {
      const t = typeof action.output
      const isObject = t === 'object' && action.output !== null && !Array.isArray(action.output)
      if (t !== 'boolean' && !isObject) {
        throw new Error(`Invalid job "${rawObject.name}": action "${action.name}" has an invalid "output" field. It must be either a boolean (true/false) or an object mapping custom outputs.`)
      }
    }
  }

  // --- Optional: validate deprecated flag if present ---
  if (rawObject.deprecated !== undefined && typeof rawObject.deprecated !== 'boolean') {
    throw new Error(`Invalid job "${rawObject.name}": "deprecated" must be a boolean if provided.`)
  }
  // --- Optional: validate min_evm_version if present ---
  if (rawObject.min_evm_version !== undefined && typeof rawObject.min_evm_version !== 'string') {
    throw new Error(`Invalid job "${rawObject.name}": "min_evm_version" must be a string if provided.`)
  }

  // --- Construct and return the strongly-typed Job object ---
  const job: Job = {
    name: rawObject.name,
    version: rawObject.version,
    description: rawObject.description,
    depends_on: rawObject.depends_on,
    // We've validated the necessary parts, so a cast is reasonable here.
    actions: rawObject.actions as JobAction[],
    only_networks: rawObject.only_networks,
    skip_networks: rawObject.skip_networks,
    min_evm_version: rawObject.min_evm_version,
    deprecated: rawObject.deprecated === true
  }

  return job
}