import { parse as parseYaml, YAMLParseError } from 'yaml'
import { Template, Action, Condition, Value } from '../types'

/**
 * Helper to check if a parsed YAML object represents a Condition.
 * Conditions are specific checks that resolve to a boolean, used in `skip_condition` blocks.
 * @param item The parsed object from YAML.
 * @returns True if the item is a Condition, false otherwise.
 */
function isCondition(item: any): item is Condition {
  // A 'Condition' must be an object with a 'type' property.
  if (!item || typeof item !== 'object' || typeof item.type !== 'string') {
    return false
  }

  // Check against known, specific condition types from `src/lib/types/conditions.ts`.
  if (['contract-exists', 'job-completed'].includes(item.type)) {
    return true
  }

  // The 'basic-arithmetic' ValueResolver can also act as a Condition
  // if it performs a boolean comparison operation.
  if (item.type === 'basic-arithmetic') {
    if (item.arguments && typeof item.arguments.operation === 'string') {
      const booleanOperations = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte']
      return booleanOperations.includes(item.arguments.operation)
    }
  }

  return false
}

/**
 * Parses a YAML string defining an action template into a structured `Template` object.
 * This function handles validation and normalization of the template structure, including
 * the flexible `setup` block which can be an array of mixed actions/conditions or
 * a structured object.
 *
 * @param yamlContent The raw YAML content of the template file as a string.
 * @returns The parsed and validated `Template` object.
 * @throws {Error} If the YAML is malformed, or if the template is missing required fields
 *                 like `name`, `actions`, or `outputs`.
 */
export function parseTemplate(yamlContent: string): Template {
  let rawObject: any
  try {
    rawObject = parseYaml(yamlContent)
  } catch (e) {
    if (e instanceof YAMLParseError) {
      // Provide a more user-friendly error message including the line number
      const line = e.linePos?.[0].line ? ` at line ${e.linePos[0].line}` : ''
      throw new Error(`Failed to parse template YAML: ${e.message}${line}.`)
    }
    throw e
  }

  if (!rawObject || typeof rawObject !== 'object') {
    throw new Error('Invalid template: YAML content must resolve to an object.')
  }

  // --- Validate required fields ---
  if (!rawObject.name || typeof rawObject.name !== 'string') {
    throw new Error('Invalid template: "name" field is required and must be a string.')
  }
  if (!rawObject.actions || !Array.isArray(rawObject.actions)) {
    throw new Error(`Invalid template "${rawObject.name}": "actions" field is required and must be an array.`)
  }
  
  // Allow 'outputs' to be optional. If it exists, it must be an object.
  if (rawObject.outputs && (typeof rawObject.outputs !== 'object' || Array.isArray(rawObject.outputs))) {
    throw new Error(`Invalid template "${rawObject.name}": "outputs" field must be an object if provided.`)
  }

  // --- Construct the base template object ---
  const template: Template = {
    name: rawObject.name,
    description: rawObject.description,
    arguments: rawObject.arguments,
    returns: rawObject.returns,
    actions: rawObject.actions as Action[],
    skip_condition: rawObject.skip_condition as Condition[],
  }

  // Only include outputs if it was provided in the YAML
  if (rawObject.outputs) {
    template.outputs = rawObject.outputs as Record<string, Value<any>>
  }

  // --- Handle the 'setup' block which can have multiple formats ---
  if (rawObject.setup) {
    if (Array.isArray(rawObject.setup)) {
      // Format 1: An array of mixed actions and conditions (e.g., sequence-factory-v1.yaml).
      // We need to iterate and categorize each item.
      const setupActions: Action[] = []
      const setupConditions: Condition[] = []

      for (const item of rawObject.setup) {
        if (isCondition(item)) {
          setupConditions.push(item)
        } else {
          // If it's not an explicit condition, we assume it's an action.
          setupActions.push(item as Action)
        }
      }

      template.setup = {}
      if (setupActions.length > 0) {
        template.setup.actions = setupActions
      }
      if (setupConditions.length > 0) {
        template.setup.skip_condition = setupConditions
      }
    } else if (typeof rawObject.setup === 'object') {
      // Format 2: A structured object (e.g., nano-universal-deployer.yaml), which maps directly to our type.
      template.setup = {
        actions: (rawObject.setup.actions || []) as Action[],
        skip_condition: (rawObject.setup.skip_condition || []) as Condition[],
      }
    } else {
      throw new Error(`Invalid template "${rawObject.name}": "setup" field must be an array or an object if provided.`)
    }
  }

  return template
}