import { parse as parseYaml, YAMLParseError } from 'yaml'
import { ConstantsDocument } from '../types'

/**
 * Parses a YAML string defining a constants document into a structured ConstantsDocument.
 * Accepts files with `type: "constants"`, optional `name`, and required `constants` object.
 * Returns null if the YAML is not a constants document.
 */
export function parseConstants(yamlContent: string): ConstantsDocument | null {
  let rawObject: any
  try {
    rawObject = parseYaml(yamlContent)
  } catch (e) {
    if (e instanceof YAMLParseError) {
      const line = (e as any).linePos?.[0]?.line ? ` at line ${(e as any).linePos[0].line}` : ''
      throw new Error(`Failed to parse constants YAML: ${e.message}${line}.`)
    }
    throw e
  }

  if (!rawObject || typeof rawObject !== 'object') {
    return null
  }

  if (rawObject.type !== 'constants') {
    return null
  }

  if (rawObject.name !== undefined && typeof rawObject.name !== 'string') {
    throw new Error('Invalid constants: "name" must be a string if provided.')
  }

  if (!rawObject.constants || typeof rawObject.constants !== 'object' || Array.isArray(rawObject.constants)) {
    throw new Error('Invalid constants: "constants" field is required and must be an object.')
  }

  const doc: ConstantsDocument = {
    type: 'constants',
    name: rawObject.name,
    constants: rawObject.constants
  }

  return doc
}

/**
 * Validates and extracts optional job-level constants from a parsed job raw object.
 * Throws if present but not an object.
 */
export function extractJobConstants(rawJob: any, jobNameForErrors: string): Record<string, any> | undefined {
  if (rawJob.constants === undefined) return undefined
  if (typeof rawJob.constants !== 'object' || Array.isArray(rawJob.constants)) {
    throw new Error(`Invalid job "${jobNameForErrors}": "constants" field must be an object if provided.`)
  }
  return rawJob.constants as Record<string, any>
}