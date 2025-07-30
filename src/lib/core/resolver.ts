import { ethers } from 'ethers'
import {
  Value,
  ValueResolver as ValueResolverObject,
  AbiEncodeValue,
  ConstructorEncodeValue,
  ComputeCreate2Value,
  ReadBalanceValue,
  BasicArithmeticValue,
  CallValue,
  ContractExistsCondition,
  ContractExistsValue,
} from '../types'
import { ExecutionContext } from './context'

/**
 * A scope for resolving local variables, such as template arguments.
 * This allows a template to use placeholders like `{{my_arg}}` which are
 * filled in by the job calling the template.
 */
export type ResolutionScope = Map<string, any>

/**
 * The ValueResolver is responsible for turning declarative `Value` types from
 * the YAML files into concrete, usable data at runtime. It handles placeholders,
 * on-chain data fetching, and dynamic computations like encoding and address calculation.
 */
export class ValueResolver {
  /**
   * Resolves a `Value<any>` into its final, concrete form.
   * This is the main entry point for the resolver.
   *
   * @param value The value to resolve. It can be a literal, a `{{...}}` reference string,
   *              or a `ValueResolver` object (e.g., `{ type: 'abi-encode', ... }`).
   * @param context The execution context, providing access to the provider, signer, and outputs.
   * @param scope The local resolution scope, used for template arguments.
   * @returns A promise that resolves to the final concrete value.
   */
  public async resolve<T>(value: Value<any>, context: ExecutionContext, scope: ResolutionScope = new Map()): Promise<T> {
    // 1. Handle literals (non-string, non-object) and null
    if (typeof value !== 'string' && (typeof value !== 'object' || value === null)) {
      return value as T
    }

    // 2. Handle string values
    if (typeof value === 'string') {
      const refMatch = value.match(/^{{(.*)}}$/)
      if (refMatch) {
        // It's a reference like `{{...}}`, resolve the expression inside
        const expression = refMatch[1].trim()
        return this.resolveExpression(expression, context, scope)
      }
      // It's a string literal
      return value as T
    }

    // 3. Handle arrays
    if (Array.isArray(value)) {
      return Promise.all(value.map(item => this.resolve(item, context, scope))) as Promise<T>
    }

    // 4. Handle ValueResolver objects
    if (typeof value === 'object' && 'type' in value) {
      return this.resolveValueResolverObject(value as ValueResolverObject, context, scope)
    }

    // 5. If we get here, it's an object that is not a ValueResolver (e.g., from an `arguments` block)
    // The calling code should iterate through the object's keys and resolve each value individually.
    // Throw an error to prevent unexpected behavior.
    throw new Error(`Cannot resolve value: not a literal, reference, or known ValueResolver object: ${JSON.stringify(value)}`)
  }

  /**
   * Resolves an expression from inside a `{{...}}` placeholder.
   * @private
   */
  private async resolveExpression(expression: string, context: ExecutionContext, scope: ResolutionScope): Promise<any> {
    // Check for function-like expressions, e.g., `creationCode(id)`
    const funcMatch = expression.match(/^(\w+)\((.*)\)$/)
    if (funcMatch) {
      const [, funcName, argStr] = funcMatch
      const arg = argStr.trim()

      // Handle artifact-related functions
      // NOTE: These should have been resolved during parsing, but we keep this as a fallback
      // for any references that weren't resolved (e.g., dynamic artifact references)
      if (funcName === 'creationCode' || funcName === 'initCode') {
        const artifact = context.artifactRegistry.lookup(arg)
        if (!artifact) throw new Error(`Artifact not found for identifier: "${arg}"`)
        if (!artifact.bytecode) throw new Error(`Artifact "${artifact.contractName}" is missing bytecode.`)
        return artifact.bytecode
      }
      if (funcName === 'abi') {
        const artifact = context.artifactRegistry.lookup(arg)
        if (!artifact) throw new Error(`Artifact not found for identifier: "${arg}"`)
        if (!artifact.abi) throw new Error(`Artifact "${artifact.contractName}" is missing ABI.`)
        return artifact.abi
      }
      if (funcName === 'buildInfo') {
        // For buildInfo, find the corresponding build-info artifact identifier
        const artifact = context.artifactRegistry.lookup(arg)
        if (!artifact) throw new Error(`Artifact not found for identifier: "${arg}"`)
        
        // Read the raw artifact file to extract compilation target from metadata
        let compilationTarget: string | undefined
        try {
          const fs = await import('fs/promises')
          const artifactContent = await fs.readFile(artifact._path, 'utf-8')
          const artifactJson = JSON.parse(artifactContent)
          
          if (artifactJson.metadata?.settings?.compilationTarget) {
            const target = artifactJson.metadata.settings.compilationTarget
            const entries = Object.entries(target)
            if (entries.length === 1) {
              const [sourceName, contractName] = entries[0]
              compilationTarget = `${sourceName}:${contractName}`
            }
          }
        } catch (error) {
          throw new Error(`Failed to read artifact file for compilation target extraction: ${error instanceof Error ? error.message : String(error)}`)
        }
        
        if (!compilationTarget) {
          throw new Error(`Unable to determine compilation target for artifact: "${arg}"`)
        }
        
        // Look up the build-info artifact using the compilation target
        const buildInfoArtifact = context.artifactRegistry.lookup(compilationTarget)
        if (!buildInfoArtifact) {
          throw new Error(`Build-info artifact not found for compilation target: "${compilationTarget}"`)
        }
        
        return compilationTarget
      }
      
      throw new Error(`Unknown function in expression: ${funcName}`)
    }

    // Check scope for local variables (template arguments) first
    if (scope.has(expression)) {
      return scope.get(expression)
    }

    // Check context for global outputs from other jobs/actions
    try {
      return context.getOutput(expression)
    } catch (e) {
      // Provide a more helpful error if an unresolved reference is found
      throw new Error(`Failed to resolve expression "{{${expression}}}". It is not a valid artifact function, local scope variable, or a known output.`)
    }
  }

  /**
   * Dispatches a `ValueResolver` object to its specific handler.
   * @private
   */
  private async resolveValueResolverObject(
    obj: ValueResolverObject,
    context: ExecutionContext,
    scope: ResolutionScope,
  ): Promise<any> {
    // Recursively resolve all arguments before processing the object itself
    const resolvedArgs = await this.resolveArguments(obj.arguments, context, scope)

    switch (obj.type) {
      case 'abi-encode':
        return this.resolveAbiEncode(resolvedArgs as AbiEncodeValue['arguments'])
      case 'constructor-encode':
        return this.resolveConstructorEncode(resolvedArgs as ConstructorEncodeValue['arguments'])
      case 'compute-create2':
        return this.resolveComputeCreate2(resolvedArgs as ComputeCreate2Value['arguments'])
      case 'read-balance':
        return this.resolveReadBalance(resolvedArgs as ReadBalanceValue['arguments'], context)
      case 'basic-arithmetic':
        return this.resolveBasicArithmetic(resolvedArgs as BasicArithmeticValue['arguments'])
      case 'call':
        return this.resolveCall(resolvedArgs as CallValue['arguments'], context)
      case 'contract-exists':
        return this.resolveContractExists(resolvedArgs as ContractExistsValue['arguments'], context)
      default:
        throw new Error(`Unknown value resolver type: ${(obj as any).type}`)
    }
  }

  // --- Specific Resolver Implementations ---

  private resolveAbiEncode(args: AbiEncodeValue['arguments']): string {
    const { signature, values } = args

    // Validate that signature is provided
    if (!signature) {
      throw new Error('abi-encode: signature is required')
    }

    // Validate that values array is provided
    if (!values) {
      throw new Error('abi-encode: values array is required')
    }

    // At this point, signature should be resolved to a string
    const signatureStr = signature as string
    if (typeof signatureStr !== 'string') {
      throw new Error('abi-encode: signature must be a string')
    }

    try {
      // Create a temporary interface with just this function to encode the data
      const iface = new ethers.Interface([`function ${signatureStr}`])
      
      // Get the function name from the signature (everything before the first '(')
      const functionName = signatureStr.split('(')[0]
      
      // Encode the function call data
      return iface.encodeFunctionData(functionName, values)
    } catch (error) {
      throw new Error(`abi-encode: Failed to encode function data: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private resolveConstructorEncode(args: ConstructorEncodeValue['arguments']): string {
    const { creationCode, types, values } = args

    // Validate that creation code is valid bytecode
    if (!ethers.isBytesLike(creationCode)) {
      throw new Error(`Invalid creation code: ${creationCode}`)
    }

    // If no constructor arguments, return the creation code as-is
    if (!types || !values || types.length === 0 || values.length === 0) {
      return creationCode
    }

    // Validate that types and values arrays have the same length
    if (types.length !== values.length) {
      throw new Error(`constructor-encode: types array length (${types.length}) must match values array length (${values.length})`)
    }

    // ABI encode the constructor arguments using the explicit types
    const encodedArgs = ethers.AbiCoder.defaultAbiCoder().encode(types as string[], values)

    // Concatenate creation code with encoded constructor arguments
    // Remove '0x' prefix from encoded args if present
    const cleanEncodedArgs = encodedArgs.startsWith('0x') ? encodedArgs.slice(2) : encodedArgs
    const cleanCreationCode = creationCode.startsWith('0x') ? creationCode.slice(2) : creationCode

    return '0x' + cleanCreationCode + cleanEncodedArgs
  }

  private resolveComputeCreate2(args: ComputeCreate2Value['arguments']): string {
    const { deployerAddress, salt, initCode } = args
    // Check if the deployer address is a valid address
    if (!ethers.isAddress(deployerAddress)) {
      throw new Error(`Invalid deployer address: ${deployerAddress}`)
    }
    // Check if the salt is a valid bytes value
    if (!ethers.isBytesLike(salt)) {
      throw new Error(`Invalid salt: ${salt}`)
    }
    // Check if the init code is a valid bytes value
    if (!ethers.isBytesLike(initCode)) {
      throw new Error(`Invalid init code: ${initCode}`)
    }
    // Hash the init code using Keccak256
    const initCodeHash = ethers.keccak256(initCode)
    // Create the create2 address
    return ethers.getCreate2Address(deployerAddress, salt, initCodeHash)
  }

  private async resolveReadBalance(args: ReadBalanceValue['arguments'], context: ExecutionContext): Promise<string> {
    // Check if the address is a valid address
    const addressValue = args.address as any

    if (!ethers.isAddress(addressValue)) {
      throw new Error(`Invalid address: ${addressValue}`)
    }

    const balance = await context.provider.getBalance(addressValue)
    return balance.toString()
  }

  private resolveBasicArithmetic(args: BasicArithmeticValue['arguments']): string | boolean {
    if (!args.values || args.values.length < 2) {
      throw new Error(`basic-arithmetic requires at least 2 values, got ${args.values?.length ?? 0}`)
    }

    const numbers = args.values.map(v => ethers.toBigInt(v))
    const [a, b] = numbers

    switch (args.operation) {
      // Arithmetic (return string)
      case 'add': return numbers.reduce((sum, current) => sum + current).toString()
      case 'sub': return (a - b).toString()
      case 'mul': return (a * b).toString()
      case 'div': return (a / b).toString()

      // Comparison (return boolean)
      case 'eq':  return a === b
      case 'neq': return a !== b
      case 'gt':  return a > b
      case 'lt':  return a < b
      case 'gte': return a >= b
      case 'lte': return a <= b

      default:
        throw new Error(`Unsupported basic-arithmetic operation: ${args.operation}`)
    }
  }

  private async resolveCall(args: CallValue['arguments'], context: ExecutionContext): Promise<any> {
    const { to, signature, values } = args

    // Validate that we have a target address
    if (!to) {
      throw new Error('call: target address (to) is required')
    }

    // Validate that the target address is a valid Ethereum address
    if (!ethers.isAddress(to)) {
      throw new Error(`call: invalid target address: ${to}`)
    }

    // Validate that signature is provided
    if (!signature) {
      throw new Error('call: function signature is required')
    }

    // Validate that values array is provided
    if (!values) {
      throw new Error('call: values array is required')
    }

    const signatureStr = signature as string
    if (typeof signatureStr !== 'string') {
      throw new Error('call: signature must be a string')
    }

    try {
      // Create a temporary interface with just this function to encode the call data
      const iface = new ethers.Interface([`function ${signatureStr}`])
      
      // Get the function name from the signature (everything before the first '(')
      const functionName = signatureStr.split('(')[0]
      
      // Encode the function call data
      const callData = iface.encodeFunctionData(functionName, values)

      // Make the call using the provider
      const result = await context.provider.call({
        to: to,
        data: callData
      })

      // If the result is '0x', it means the function doesn't return anything
      if (result === '0x') {
        return null
      }

      // Decode the result using the function's return type
      const decodedResult = iface.decodeFunctionResult(functionName, result)
      
      // If there's only one return value, return it directly
      // Otherwise, return the array of values
      if (decodedResult.length === 1) {
        return decodedResult[0]
      }
      
      return decodedResult
    } catch (error) {
      throw new Error(`call: Failed to execute contract call: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async resolveContractExists(args: ContractExistsValue['arguments'], context: ExecutionContext): Promise<boolean> {
    const { address } = args

    if (!ethers.isAddress(address)) {
      throw new Error(`contract-exists: invalid address: ${address}`)
    }

    try {
      const code = await context.provider.getCode(address)
      // getCode returns '0x' if no contract exists at the address
      return code !== '0x'
    } catch (error) {
      throw new Error(`contract-exists: Failed to check contract existence: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Helper to recursively resolve the `arguments` field of any `ValueResolver` object.
   * @private
   */
  private async resolveArguments(args: any, context: ExecutionContext, scope: ResolutionScope): Promise<any> {
    if (Array.isArray(args)) {
      return Promise.all(args.map(arg => this.resolve(arg, context, scope)))
    }
    if (typeof args === 'object' && args !== null) {
      const resolvedObject: { [key: string]: any } = {}
      for (const key in args) {
        if (Object.prototype.hasOwnProperty.call(args, key)) {
          resolvedObject[key] = await this.resolve(args[key], context, scope)
        }
      }
      return resolvedObject
    }
    return this.resolve(args, context, scope)
  }
}