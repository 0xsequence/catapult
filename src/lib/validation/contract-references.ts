import { ProjectLoader } from '../core/loader'
import { Action, Template, Job, JobAction, Value } from '../types'

export interface MissingContractReference {
  reference: string
  location: string
}

export interface UsedContractReference {
  reference: string
  location: string
}

/**
 * Extracts all Contract() references actually used in the project
 */
export async function extractUsedContractReferences(loader: ProjectLoader): Promise<UsedContractReference[]> {
  const usedRefs: UsedContractReference[] = []
  
  // Extract from jobs
  for (const [jobName, job] of loader.jobs.entries()) {
    extractJobActionsContractReferences(job.actions, `job '${jobName}'`, job._path, usedRefs)
  }
  
  // Extract from templates
  for (const [templateName, template] of loader.templates.entries()) {
    extractActionsContractReferences(template.actions, `template '${templateName}'`, template._path, usedRefs)
    
    // Extract from template setup actions if they exist
    if (template.setup?.actions) {
      extractActionsContractReferences(template.setup.actions, `template '${templateName}' setup`, template._path, usedRefs)
    }
    
    // Extract from template outputs
    if (template.outputs) {
      extractValueContractReferences(template.outputs, `template '${templateName}' outputs`, template._path, usedRefs)
    }
  }
  
  return usedRefs
}

/**
 * Validates that all Contract() references in the project point to existing contracts
 */
export async function validateContractReferences(loader: ProjectLoader): Promise<MissingContractReference[]> {
  const missingRefs: MissingContractReference[] = []
  
  // Validate jobs
  for (const [jobName, job] of loader.jobs.entries()) {
    validateJobActionsForMissingContracts(job.actions, `job '${jobName}'`, job._path, loader, missingRefs)
  }
  
  // Validate templates
  for (const [templateName, template] of loader.templates.entries()) {
    validateActionsForMissingContracts(template.actions, `template '${templateName}'`, template._path, loader, missingRefs)
    
    // Validate template setup actions if they exist
    if (template.setup?.actions) {
      validateActionsForMissingContracts(template.setup.actions, `template '${templateName}' setup`, template._path, loader, missingRefs)
    }
    
    // Validate template outputs
    if (template.outputs) {
      validateValueForMissingContracts(template.outputs, `template '${templateName}' outputs`, template._path, loader, missingRefs)
    }
  }
  
  return missingRefs
}

/**
 * Extracts contract references from job actions
 */
function extractJobActionsContractReferences(
  actions: JobAction[], 
  locationPrefix: string, 
  contextPath: string | undefined,
  usedRefs: UsedContractReference[]
): void {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const actionLocation = `${locationPrefix}, action ${i + 1}${action.name ? ` '${action.name}'` : ''}`
    
    extractValueContractReferences(action.arguments, actionLocation, contextPath, usedRefs)
  }
}

/**
 * Extracts contract references from template actions
 */
function extractActionsContractReferences(
  actions: Action[], 
  locationPrefix: string, 
  contextPath: string | undefined,
  usedRefs: UsedContractReference[]
): void {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const actionLocation = `${locationPrefix}, action ${i + 1}${action.name ? ` '${action.name}'` : ''}`
    
    extractValueContractReferences(action.arguments, actionLocation, contextPath, usedRefs)
  }
}

/**
 * Recursively extracts contract references from a value (or nested object/array)
 */
function extractValueContractReferences(
  value: any, 
  location: string, 
  contextPath: string | undefined,
  usedRefs: UsedContractReference[]
): void {
  if (typeof value === 'string') {
    // Check for Contract() expressions
    const contractMatch = value.match(/^{{Contract\((.*?)\)(?:\.\w+)?}}$/)
    if (contractMatch) {
      const reference = contractMatch[1].trim()
      usedRefs.push({
        reference,
        location: `${location}, Contract(${reference})`
      })
    }
  } else if (Array.isArray(value)) {
    // Recursively check array elements
    for (let i = 0; i < value.length; i++) {
      extractValueContractReferences(value[i], `${location}[${i}]`, contextPath, usedRefs)
    }
  } else if (typeof value === 'object' && value !== null) {
    // Recursively check object properties
    for (const [key, val] of Object.entries(value)) {
      extractValueContractReferences(val, `${location}.${key}`, contextPath, usedRefs)
    }
  }
}

/**
 * Validates a list of job actions for missing contract references
 */
function validateJobActionsForMissingContracts(
  actions: JobAction[], 
  locationPrefix: string, 
  contextPath: string | undefined,
  loader: ProjectLoader, 
  missingRefs: MissingContractReference[]
): void {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const actionLocation = `${locationPrefix}, action ${i + 1}${action.name ? ` '${action.name}'` : ''}`
    
    validateValueForMissingContracts(action.arguments, actionLocation, contextPath, loader, missingRefs)
  }
}

/**
 * Validates a list of template actions for missing contract references
 */
function validateActionsForMissingContracts(
  actions: Action[], 
  locationPrefix: string, 
  contextPath: string | undefined,
  loader: ProjectLoader, 
  missingRefs: MissingContractReference[]
): void {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const actionLocation = `${locationPrefix}, action ${i + 1}${action.name ? ` '${action.name}'` : ''}`
    
    validateValueForMissingContracts(action.arguments, actionLocation, contextPath, loader, missingRefs)
  }
}

/**
 * Recursively validates a value (or nested object/array) for missing contract references
 */
function validateValueForMissingContracts(
  value: any, 
  location: string, 
  contextPath: string | undefined,
  loader: ProjectLoader, 
  missingRefs: MissingContractReference[]
): void {
  if (typeof value === 'string') {
    // Check for Contract() expressions
    const contractMatch = value.match(/^{{Contract\((.*?)\)(?:\.\w+)?}}$/)
    if (contractMatch) {
      const reference = contractMatch[1].trim()
      
      // Try to lookup the contract
      const contract = loader.contractRepository.lookup(reference, contextPath)
      if (!contract) {
        missingRefs.push({
          reference,
          location: `${location}, Contract(${reference})`
        })
      }
    }
  } else if (Array.isArray(value)) {
    // Recursively check array elements
    for (let i = 0; i < value.length; i++) {
      validateValueForMissingContracts(value[i], `${location}[${i}]`, contextPath, loader, missingRefs)
    }
  } else if (typeof value === 'object' && value !== null) {
    // Recursively check object properties
    for (const [key, val] of Object.entries(value)) {
      validateValueForMissingContracts(val, `${location}.${key}`, contextPath, loader, missingRefs)
    }
  }
}