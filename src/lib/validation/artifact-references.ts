import { Job, Template, Value, Action } from '../types'
import { ArtifactRegistry } from '../artifacts/registry'

export interface ArtifactReferenceError {
  type: 'missing_artifact'
  message: string
  location: string
  artifactIdentifier: string
}

export class ArtifactReferenceValidator {
  constructor(private readonly artifactRegistry: ArtifactRegistry) {}

  /**
   * Validates all artifact references in jobs and templates exist in the registry.
   * @param jobs Map of all jobs in the project
   * @param templates Map of all templates in the project
   * @returns Array of validation errors (empty if all references are valid)
   */
  public validateAll(
    jobs: Map<string, Job>,
    templates: Map<string, Template>
  ): ArtifactReferenceError[] {
    const errors: ArtifactReferenceError[] = []

    // Validate all jobs
    for (const [jobName, job] of jobs) {
      this.validateJob(job, errors)
    }

    // Validate all templates
    for (const [templateName, template] of templates) {
      this.validateTemplate(template, errors)
    }

    return errors
  }

  private validateJob(job: Job, errors: ArtifactReferenceError[]): void {
    for (const action of job.actions) {
      this.validateJobAction(action, `job "${job.name}"`, errors)
    }
  }

  private validateTemplate(template: Template, errors: ArtifactReferenceError[]): void {
    // Validate setup actions
    if (template.setup?.actions) {
      for (const action of template.setup.actions) {
        this.validateAction(action, `template "${template.name}" setup`, errors)
      }
    }

    // Validate main actions
    for (const action of template.actions) {
      this.validateAction(action, `template "${template.name}"`, errors)
    }

    // Validate outputs
    if (template.outputs) {
      for (const [outputName, outputValue] of Object.entries(template.outputs)) {
        this.validateValue(outputValue, `template "${template.name}" output "${outputName}"`, errors)
      }
    }
  }

  private validateJobAction(action: { name: string; arguments: Record<string, Value<any>> }, location: string, errors: ArtifactReferenceError[]): void {
    for (const [argName, argValue] of Object.entries(action.arguments)) {
      this.validateValue(argValue, `${location} action "${action.name}" argument "${argName}"`, errors)
    }
  }

  private validateAction(action: Action, location: string, errors: ArtifactReferenceError[]): void {
    if ('arguments' in action && action.arguments) {
      for (const [argName, argValue] of Object.entries(action.arguments)) {
        const actionName = action.name || action.type
        this.validateValue(argValue, `${location} action "${actionName}" argument "${argName}"`, errors)
      }
    }
  }

  private validateValue(value: Value<any>, location: string, errors: ArtifactReferenceError[]): void {
    if (typeof value === 'string') {
      // Check for artifact function references
      this.validateStringReference(value, location, errors)
    } else if (Array.isArray(value)) {
      // Recursively validate array elements
      value.forEach((item, index) => {
        this.validateValue(item, `${location}[${index}]`, errors)
      })
    } else if (value && typeof value === 'object') {
      // Handle ValueResolver objects
      if ('type' in value) {
        this.validateValueResolverObject(value, location, errors)
      } else {
        // Handle plain objects by recursively validating values
        for (const [key, val] of Object.entries(value)) {
          this.validateValue(val, `${location}.${key}`, errors)
        }
      }
    }
  }

  private validateStringReference(value: string, location: string, errors: ArtifactReferenceError[]): void {
    // Match patterns like {{creationCode(artifact-name)}} or {{abi(artifact-name)}}
    const refMatch = value.match(/^{{(.*)}}$/)
    if (!refMatch) {
      return // Not a reference
    }

    const expression = refMatch[1].trim()
    
    // Check for artifact function calls
    const funcMatch = expression.match(/^(creationCode|initCode|abi)\((.*)\)$/)
    if (funcMatch) {
      const [, funcName, argStr] = funcMatch
      const artifactIdentifier = argStr.trim()

      // Empty identifier is handled by the resolver, but we should check for it
      if (!artifactIdentifier) {
        errors.push({
          type: 'missing_artifact',
          message: `Empty artifact identifier in ${funcName}() function`,
          location,
          artifactIdentifier: ''
        })
        return
      }

      // Check if the artifact exists in the registry
      const artifact = this.artifactRegistry.lookup(artifactIdentifier)
      if (!artifact) {
        errors.push({
          type: 'missing_artifact',
          message: `Artifact not found for identifier: "${artifactIdentifier}"`,
          location,
          artifactIdentifier
        })
      } else {
        // Additional validation based on function type
        if ((funcName === 'creationCode' || funcName === 'initCode') && !artifact.bytecode) {
          errors.push({
            type: 'missing_artifact',
            message: `Artifact "${artifact.contractName}" is missing bytecode for ${funcName}() function`,
            location,
            artifactIdentifier
          })
        } else if (funcName === 'abi' && !artifact.abi) {
          errors.push({
            type: 'missing_artifact',
            message: `Artifact "${artifact.contractName}" is missing ABI for abi() function`,
            location,
            artifactIdentifier
          })
        }
      }
    }
  }

  private validateValueResolverObject(value: any, location: string, errors: ArtifactReferenceError[]): void {
    // Recursively validate all properties of ValueResolver objects
    if (value.arguments && typeof value.arguments === 'object') {
      for (const [key, val] of Object.entries(value.arguments)) {
        this.validateValue(val, `${location}.arguments.${key}`, errors)
      }
    }
  }
} 