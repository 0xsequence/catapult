import { getAddress, keccak256, toUtf8Bytes } from 'ethers'
import { validateBigNumberish, validateHexData } from './utils/validation'

export const SAFE_TRANSACTION_SCHEMA = 'catapult.safe-transaction.v1' as const

export type SafeOperation = 0 | 1

export interface SafeTransactionArtifact {
  schema: typeof SAFE_TRANSACTION_SCHEMA
  chainId: string
  safe: string
  to: string
  value: string
  data: string
  operation: SafeOperation
}

export interface SafeTransactionBuilderTransaction {
  to: string
  value: string
  data?: string
  contractMethod?: {
    inputs: Array<{ internalType: string; name: string; type: string; components?: unknown[] }>
    name: string
    payable: boolean
  } | null
  contractInputsValues?: Record<string, string> | null
}

export interface SafeTransactionBuilderBatch {
  version: '1.0'
  chainId: string
  createdAt: number
  meta: {
    name: string
    description?: string
    txBuilderVersion?: string
    createdFromSafeAddress: string
    createdFromOwnerAddress: string
    checksum?: string
  }
  transactions: SafeTransactionBuilderTransaction[]
}

export interface ExtractedSafeTransaction {
  selector: string
  artifact: SafeTransactionArtifact
}

function normalizeAddress(value: unknown, actionName: string, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Action "${actionName}": ${fieldName} must be an EVM address string`)
  }

  try {
    return getAddress(value)
  } catch {
    throw new Error(`Action "${actionName}": ${fieldName} is not a valid EVM address: ${value}`)
  }
}

function normalizeValue(value: unknown, actionName: string): string {
  const validated = validateBigNumberish(value, actionName, 'value')
  const normalized = BigInt(validated)
  if (normalized > (1n << 256n) - 1n) {
    throw new Error(`Action "${actionName}": value exceeds uint256`)
  }
  return normalized.toString()
}

function normalizeData(value: unknown, actionName: string): string {
  const data = validateHexData(value, actionName, 'data')
  if ((data.length - 2) % 2 !== 0) {
    throw new Error(`Action "${actionName}": data must contain complete bytes`)
  }
  return data
}

function normalizeOperation(value: unknown, actionName: string): SafeOperation {
  if (!['number', 'string', 'bigint'].includes(typeof value)) {
    throw new Error(`Action "${actionName}": operation must be numeric`)
  }
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new Error(`Action "${actionName}": operation must be an integer`)
  }

  let operation: bigint
  try {
    operation = BigInt(value as string | number | bigint)
  } catch {
    throw new Error(`Action "${actionName}": operation must be an integer`)
  }

  if (operation !== 0n && operation !== 1n) {
    throw new Error(`Action "${actionName}": operation must be 0 (CALL) or 1 (DELEGATECALL)`)
  }
  return Number(operation) as SafeOperation
}

export function createSafeTransactionArtifact(args: {
  actionName: string
  chainId: number
  safe: unknown
  to: unknown
  value?: unknown
  data?: unknown
  operation?: unknown
}): SafeTransactionArtifact {
  if (!Number.isSafeInteger(args.chainId) || args.chainId < 0) {
    throw new Error(`Action "${args.actionName}": chainId must be a non-negative safe integer`)
  }

  return {
    schema: SAFE_TRANSACTION_SCHEMA,
    chainId: String(args.chainId),
    safe: normalizeAddress(args.safe, args.actionName, 'safe'),
    to: normalizeAddress(args.to, args.actionName, 'to'),
    value: normalizeValue(args.value ?? 0, args.actionName),
    data: normalizeData(args.data ?? '0x', args.actionName),
    operation: normalizeOperation(args.operation ?? 0, args.actionName),
  }
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const stringifyReplacer = (_key: string, value: unknown) => value === undefined ? null : value

function serializeJsonObject(json: JsonValue): string {
  if (Array.isArray(json)) {
    return `[${json.map((element) => serializeJsonObject(element)).join(',')}]`
  }

  if (typeof json === 'object' && json !== null) {
    const keys = Object.keys(json).sort()
    let serialized = `{${JSON.stringify(keys, stringifyReplacer)}`
    for (const key of keys) serialized += `${serializeJsonObject(json[key])},`
    return `${serialized}}`
  }

  return `${JSON.stringify(json, stringifyReplacer)}`
}

/**
 * Calculate the checksum used by Safe Transaction Builder batch files.
 * This deliberately mirrors Safe's canonical serializer rather than standard JSON:
 * https://github.com/safe-global/safe-wallet-monorepo/blob/main/apps/tx-builder/src/lib/checksum.ts
 */
export function calculateSafeTransactionBuilderChecksum(batch: SafeTransactionBuilderBatch): string {
  // Safe's checksum intentionally excludes meta.name and the checksum itself.
  const { checksum: _checksum, ...metaWithoutChecksum } = batch.meta
  const serialized = serializeJsonObject({
    ...batch,
    meta: { ...metaWithoutChecksum, name: null },
  } as unknown as JsonValue)
  return keccak256(toUtf8Bytes(serialized))
}

export function createSafeTransactionBuilderBatch(
  artifacts: SafeTransactionArtifact[],
  options: { name?: string; description?: string; createdAt?: number } = {},
): SafeTransactionBuilderBatch {
  if (artifacts.length === 0) throw new Error('Cannot build a Safe batch without transactions')

  const normalizedArtifacts = artifacts.map((artifact, index) => {
    if (artifact.schema !== SAFE_TRANSACTION_SCHEMA) {
      throw new Error(`Transaction ${index + 1} is not a ${SAFE_TRANSACTION_SCHEMA} artifact`)
    }
    return createSafeTransactionArtifact({
      actionName: `Safe batch transaction ${index + 1}`,
      chainId: Number(artifact.chainId),
      safe: artifact.safe,
      to: artifact.to,
      value: artifact.value,
      data: artifact.data,
      operation: artifact.operation,
    })
  })

  const first = normalizedArtifacts[0]
  for (const artifact of normalizedArtifacts) {
    if (artifact.chainId !== first.chainId) {
      throw new Error('All transactions in a Safe batch must use the same chain ID')
    }
    if (artifact.safe.toLowerCase() !== first.safe.toLowerCase()) {
      throw new Error('All transactions in a Safe batch must use the same Safe')
    }
    if (artifact.operation !== 0) {
      throw new Error('Safe Transaction Builder export supports CALL (operation 0) only')
    }
  }

  const batch: SafeTransactionBuilderBatch = {
    version: '1.0',
    chainId: first.chainId,
    createdAt: options.createdAt ?? Date.now(),
    meta: {
      name: options.name ?? 'Catapult Safe transactions',
      ...(options.description === undefined ? {} : { description: options.description }),
      createdFromSafeAddress: first.safe,
      createdFromOwnerAddress: '',
    },
    transactions: normalizedArtifacts.map(({ to, value, data }) => ({ to, value, data })),
  }

  batch.meta.checksum = calculateSafeTransactionBuilderChecksum(batch)
  return batch
}

function isSafeTransactionArtifact(value: unknown): value is SafeTransactionArtifact {
  if (!value || typeof value !== 'object') return false
  const artifact = value as Record<string, unknown>
  return artifact.schema === SAFE_TRANSACTION_SCHEMA &&
    typeof artifact.chainId === 'string' && /^\d+$/.test(artifact.chainId) &&
    typeof artifact.safe === 'string' &&
    typeof artifact.to === 'string' &&
    typeof artifact.value === 'string' && /^\d+$/.test(artifact.value) &&
    typeof artifact.data === 'string' && /^0x(?:[a-fA-F0-9]{2})*$/.test(artifact.data) &&
    (artifact.operation === 0 || artifact.operation === 1)
}

/** Extract first-class Safe transaction artifacts from a Catapult job output document. */
export function extractSafeTransactionsFromJobOutput(
  document: unknown,
  requestedChainId?: string,
): ExtractedSafeTransaction[] {
  if (!document || typeof document !== 'object') return []
  const output = document as { jobName?: unknown; networks?: unknown }
  if (typeof output.jobName !== 'string' || !Array.isArray(output.networks)) return []

  const extracted: ExtractedSafeTransaction[] = []
  for (const network of output.networks) {
    if (!network || typeof network !== 'object') continue
    const entry = network as { status?: unknown; chainIds?: unknown; chainId?: unknown; outputs?: unknown }
    if (entry.status !== 'success' || !entry.outputs || typeof entry.outputs !== 'object') continue

    const networkChainIds = Array.isArray(entry.chainIds)
      ? entry.chainIds.map(String)
      : entry.chainId === undefined ? [] : [String(entry.chainId)]
    if (requestedChainId !== undefined && !networkChainIds.includes(requestedChainId)) continue

    for (const [key, value] of Object.entries(entry.outputs as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || (value as Record<string, unknown>).schema !== SAFE_TRANSACTION_SCHEMA) continue
      if (!isSafeTransactionArtifact(value)) {
        throw new Error(`${output.jobName}/${key}: malformed ${SAFE_TRANSACTION_SCHEMA} artifact`)
      }

      let artifact: SafeTransactionArtifact
      try {
        artifact = createSafeTransactionArtifact({
          actionName: `${output.jobName}/${key}`,
          chainId: Number(value.chainId),
          safe: value.safe,
          to: value.to,
          value: value.value,
          data: value.data,
          operation: value.operation,
        })
      } catch (error) {
        throw new Error(`${output.jobName}/${key}: ${error instanceof Error ? error.message : String(error)}`)
      }

      if (!networkChainIds.includes(artifact.chainId)) {
        throw new Error(`${output.jobName}/${key}: Safe artifact chain ID is not present in its network output`)
      }
      if (requestedChainId !== undefined && artifact.chainId !== requestedChainId) continue

      const actionName = key.endsWith('.safeTransaction')
        ? key.slice(0, -'.safeTransaction'.length)
        : key
      extracted.push({ selector: `${output.jobName}/${actionName}`, artifact })
    }
  }

  return extracted
}
