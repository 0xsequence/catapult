/**
 * Validation utilities for type checking and conversion of resolved values.
 * These functions provide runtime type safety for values resolved from YAML configurations.
 */

/**
 * Validates and converts a value to a valid Ethereum address.
 */
export function validateAddress(value: unknown, actionName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid 'to' address for action "${actionName}": expected string, got ${typeof value}`)
  }
  
  // Basic Ethereum address validation (0x followed by 40 hex characters)
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid 'to' address format for action "${actionName}": ${value}`)
  }
  
  return value
}

/**
 * Validates and converts a value to hex data string.
 */
export function validateHexData(value: unknown, actionName: string, fieldName: string): string {
  if (value === null || value === undefined) {
    return '0x'
  }
  
  if (typeof value !== 'string') {
    throw new Error(`Invalid '${fieldName}' for action "${actionName}": expected string, got ${typeof value}`)
  }
  
  // Ensure it starts with 0x
  if (!value.startsWith('0x')) {
    throw new Error(`Invalid '${fieldName}' format for action "${actionName}": must start with '0x', got ${value}`)
  }
  
  // Validate hex characters (allow empty data as '0x')
  if (value.length > 2 && !/^0x[a-fA-F0-9]*$/.test(value)) {
    throw new Error(`Invalid '${fieldName}' format for action "${actionName}": contains non-hex characters: ${value}`)
  }
  
  return value
}

/**
 * Validates and converts a value to a BigNumberish (number, string, or BigInt).
 */
export function validateBigNumberish(value: unknown, actionName: string, fieldName: string): string | number | bigint {
  if (value === null || value === undefined) {
    return 0
  }
  
  // Handle different input types
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid '${fieldName}' for action "${actionName}": must be a non-negative integer, got ${value}`)
    }
    return value
  }
  
  if (typeof value === 'string') {
    // Handle hex strings
    if (value.startsWith('0x')) {
      if (!/^0x[a-fA-F0-9]+$/.test(value)) {
        throw new Error(`Invalid '${fieldName}' hex format for action "${actionName}": ${value}`)
      }
      return value
    }
    
    // Handle decimal strings
    if (!/^\d+$/.test(value)) {
      throw new Error(`Invalid '${fieldName}' format for action "${actionName}": must be a number or hex string, got ${value}`)
    }
    return value
  }
  
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw new Error(`Invalid '${fieldName}' for action "${actionName}": must be non-negative, got ${value}`)
    }
    return value
  }
  
  throw new Error(`Invalid '${fieldName}' type for action "${actionName}": expected number, string, or bigint, got ${typeof value}`)
}

/**
 * Validates that a value is a valid raw transaction string.
 */
export function validateRawTransaction(value: unknown, actionName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid raw transaction for action "${actionName}": expected string, got ${typeof value}`)
  }

  // Normalize: trim whitespace and allow with or without 0x prefix
  const trimmed = value.trim()
  const withoutPrefix = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed

  if (withoutPrefix.length === 0) {
    // Empty data is allowed as '0x'
    return '0x'
  }

  // Validate hex characters only
  if (!/^[a-fA-F0-9]+$/.test(withoutPrefix)) {
    // Pinpoint first invalid character for easier debugging
    const idx = withoutPrefix.search(/[^a-fA-F0-9]/)
    const marker = idx >= 0 ? ` at index ${idx} ('${withoutPrefix[idx]}')` : ''
    throw new Error(`Invalid raw transaction format for action "${actionName}": contains non-hex characters${marker}: ${value}`)
  }

  // Ensure canonical 0x-prefixed output
  return '0x' + withoutPrefix
}