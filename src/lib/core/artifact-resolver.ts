import * as path from 'path'
import { Job, Template } from '../types'
import { ArtifactRegistry } from '../artifacts/registry'

/**
 * Resolves relative artifact paths to absolute paths in jobs and templates
 * during the parsing phase, so execution doesn't need to deal with relative paths.
 */
export class ArtifactPathResolver {
  constructor(private artifactRegistry: ArtifactRegistry) {}

  /**
   * Resolves all artifact references in a job from relative to absolute paths.
   */
  public resolveJobArtifacts(job: Job): void {
    if (!job._path) return

    const basePath = path.dirname(job._path)
    
    for (const action of job.actions) {
      this.resolveObjectArtifacts(action.arguments, basePath)
    }
  }

  /**
   * Resolves all artifact references in a template from relative to absolute paths.
   */
  public resolveTemplateArtifacts(template: Template): void {
    if (!template._path) return

    const basePath = path.dirname(template._path)

    // Resolve artifacts in setup actions
    if (template.setup?.actions) {
      for (const action of template.setup.actions) {
        this.resolveObjectArtifacts(action.arguments || {}, basePath)
      }
    }

    // Resolve artifacts in main actions
    for (const action of template.actions) {
      this.resolveObjectArtifacts(action.arguments || {}, basePath)
    }

    // Resolve artifacts in outputs
    if (template.outputs) {
      this.resolveObjectArtifacts(template.outputs, basePath)
    }
  }

  /**
   * Recursively traverses an object and resolves artifact references.
   */
  private resolveObjectArtifacts(obj: any, basePath: string): void {
    if (typeof obj === 'string') {
      return // Strings are processed in-place by the caller
    } else if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = this.resolveValueArtifacts(obj[i], basePath)
      }
    } else if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          obj[key] = this.resolveValueArtifacts(obj[key], basePath)
        }
      }
    }
  }

  /**
   * Resolves artifact references in a single value.
   */
  private resolveValueArtifacts(value: any, basePath: string): any {
    if (typeof value === 'string') {
      return this.resolveStringArtifacts(value, basePath)
    } else if (Array.isArray(value)) {
      return value.map(item => this.resolveValueArtifacts(item, basePath))
    } else if (typeof value === 'object' && value !== null) {
      const resolvedObj = { ...value }
      for (const key in resolvedObj) {
        if (Object.prototype.hasOwnProperty.call(resolvedObj, key)) {
          resolvedObj[key] = this.resolveValueArtifacts(resolvedObj[key], basePath)
        }
      }
      return resolvedObj
    }
    return value
  }

  /**
   * Resolves artifact references in a string value like "{{creationCode(./artifacts/counter.json)}}"
   * to the actual artifact data (bytecode, ABI, etc.).
   */
  private resolveStringArtifacts(value: string, basePath: string): string | any {
    // Match patterns like {{creationCode(artifact-path)}} or {{abi(artifact-path)}}
    const refMatch = value.match(/^{{(.*)}}$/)
    if (!refMatch) {
      return value // Not a reference
    }

    const expression = refMatch[1].trim()
    
    // Check for artifact function calls
    const funcMatch = expression.match(/^(creationCode|initCode|abi)\((.*)\)$/)
    if (funcMatch) {
      const [, funcName, argStr] = funcMatch
      const artifactIdentifier = argStr.trim()

      // Resolve the artifact identifier to an actual artifact
      let artifact
      
      // Handle relative paths
      if (artifactIdentifier.startsWith('./') || artifactIdentifier.startsWith('../')) {
        const resolvedPath = path.resolve(basePath, artifactIdentifier)
        artifact = this.artifactRegistry.lookup(resolvedPath)
      } else {
        // Handle absolute paths, contract names, or hashes
        artifact = this.artifactRegistry.lookup(artifactIdentifier)
      }

      if (artifact) {

        
        // Return the actual artifact data instead of a reference
        if (funcName === 'creationCode' || funcName === 'initCode') {
          if (!artifact.bytecode) {
            throw new Error(`Artifact "${artifact.contractName}" is missing bytecode for ${funcName}() function`)
          }
          return artifact.bytecode
        } else if (funcName === 'abi') {
          if (!artifact.abi) {
            throw new Error(`Artifact "${artifact.contractName}" is missing ABI for abi() function`)
          }
          return artifact.abi
        }
      }
    }

    return value // Return unchanged if not an artifact reference or artifact not found
  }
} 