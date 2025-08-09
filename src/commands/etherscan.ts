import { Command } from 'commander'
import chalk from 'chalk'
import { loadNetworks } from '../lib/network-loader'
import { resolveSingleChainId } from '../lib/network-selection'
import { projectOption, verbosityOption } from './common'
import { setVerbosity } from '../index'
import * as solc from 'solc'
import { createHash } from 'crypto'

type ApiAction = 'getsourcecode' | 'getabi'

interface EtherscanCmdBase {
  project: string
  verbose: number
  etherscanApiKey?: string
  network?: string
  address: string
  raw?: boolean
}

function getEtherscanApiUrl(chainId: number): string {
  return `https://api.etherscan.io/v2/api?chainid=${chainId}`
}

type EtherscanSourceEnvelope = {
  rawResult: Record<string, unknown>
  parsedSource: unknown // standard-json object or flattened string
}

async function fetchFromEtherscan(
  chainId: number,
  apiKey: string,
  address: string,
  action: ApiAction
): Promise<unknown | EtherscanSourceEnvelope> {
  const apiUrl = getEtherscanApiUrl(chainId)
  const params = new URLSearchParams({
    module: 'contract',
    action,
    apikey: apiKey,
    address
  })
  const resp = await fetch(`${apiUrl}&${params.toString()}`, {
    method: 'GET',
    signal: AbortSignal.timeout(20000)
  })
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
  }
  const data = await resp.json() as {
    status: string
    message?: string
    result:
      | string
      | Array<{
          SourceCode?: string
          ABI?: string
          [key: string]: unknown
        }>
  }

  if (data.status !== '1') {
    // Etherscan v2 returns status "0" with message in result
    const msg = typeof data.result === 'string' ? data.result : JSON.stringify(data.result)
    throw new Error(msg || 'Unknown Etherscan error')
  }

  if (action === 'getabi') {
    // data.result is a JSON-encoded string for ABI, parse and return as object
    if (typeof data.result !== 'string') {
      throw new Error('Unexpected ABI result format from Etherscan')
    }
    try {
      return JSON.parse(data.result as string)
    } catch (_e) {
      throw new Error('Failed to parse ABI JSON returned by Etherscan')
    }
  }

  if (action === 'getsourcecode') {
    // data.result[0].SourceCode is a string; when standard-json it is wrapped with a leading and trailing character
    if (!Array.isArray(data.result) || data.result.length === 0) {
      throw new Error('Empty result from Etherscan')
    }
    const first = (data.result as Array<{ SourceCode?: string }>)[0] as Record<string, unknown>
    const sourceCodeRaw = first?.SourceCode as string
    if (typeof sourceCodeRaw !== 'string' || sourceCodeRaw.length === 0) {
      throw new Error('No SourceCode found on Etherscan')
    }

    // The SourceCode may be:
    // 1) a raw source (flattened) string
    // 2) a JSON string that may be double-wrapped like: "{...}" or "{{...}}"
    // Try to normalize to a parsed JSON object when possible, otherwise return the raw string.
    const trimmed = sourceCodeRaw.trim()
    // Heuristic: if it starts with '{{' and ends with '}}', strip one layer
    const cleaned = trimmed.startsWith('{{') && trimmed.endsWith('}}')
      ? trimmed.slice(1, -1)
      : trimmed

    // Try to parse JSON; if it fails, return string
    try {
      const parsed = JSON.parse(cleaned)
      return { rawResult: first, parsedSource: parsed }
    } catch {
      // Not JSON, return as-is string
      return { rawResult: first, parsedSource: sourceCodeRaw }
    }
  }

  return data.result
}

export function makeEtherscanCommand(): Command {
  const etherscan = new Command('etherscan')
    .description('Etherscan helper commands (ABI/source fetch)')

  // Common options builder
  const withCommon = (cmd: Command) => {
    projectOption(cmd)
    verbosityOption(cmd)
    cmd
      .option('--etherscan-api-key <key>', 'Etherscan API key. Can also be set via ETHERSCAN_API_KEY env var.')
     .option('-n, --network <selector>', 'Target network (chain ID or name). When a name matches multiple networks, the first match is used.')
      .option('-a, --address <address>', 'Contract address to query', '')
      .option('--raw', 'Print raw response (no pretty JSON). Useful for piping.', false)
    return cmd
  }

  // etherscan abi
  const abi = new Command('abi')
    .description('Fetch contract ABI from Etherscan and print to stdout')
  withCommon(abi)
  abi.action(async (options: EtherscanCmdBase) => {
    try {
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)

      const apiKey = options.etherscanApiKey || process.env.ETHERSCAN_API_KEY
      if (!apiKey) {
        console.error(chalk.red('Etherscan API key is required. Use --etherscan-api-key or set ETHERSCAN_API_KEY.'))
        process.exit(1)
      }

      if (!options.address) {
        console.error(chalk.red('Missing required --address option'))
        process.exit(1)
      }

      // Determine chainId
      let chainId: number | undefined
      const networks = await loadNetworks(options.project)
      if (options.network) {
        chainId = resolveSingleChainId(options.network, networks)
      } else if (networks.length === 1) {
        chainId = networks[0].chainId
      }
      if (!chainId) {
        console.error(chalk.red('Please provide --network <selector>. When multiple networks are configured, selection is required.'))
        process.exit(1)
      }

      const result = await fetchFromEtherscan(chainId!, apiKey, options.address, 'getabi')

      if (options.raw) {
        // raw: output minified JSON
        process.stdout.write(JSON.stringify(result))
      } else {
        // pretty
        console.log(JSON.stringify(result, null, 2))
      }
    } catch (error) {
      console.error(chalk.red('Error fetching ABI from Etherscan:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  // etherscan source
  const source = new Command('source')
    .description('Fetch contract source and emit a self-contained build-info JSON suitable for verification')
  withCommon(source)
  source.action(async (options: EtherscanCmdBase) => {
    try {
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)

      const apiKey = options.etherscanApiKey || process.env.ETHERSCAN_API_KEY
      if (!apiKey) {
        console.error(chalk.red('Etherscan API key is required. Use --etherscan-api-key or set ETHERSCAN_API_KEY.'))
        process.exit(1)
      }

      if (!options.address) {
        console.error(chalk.red('Missing required --address option'))
        process.exit(1)
      }

      // Determine chainId
      let chainId: number | undefined
      const networks2 = await loadNetworks(options.project)
      if (options.network) {
        chainId = resolveSingleChainId(options.network, networks2)
      } else if (networks2.length === 1) {
        chainId = networks2[0].chainId
      }
      if (!chainId) {
        console.error(chalk.red('Please provide --network <selector>. When multiple networks are configured, selection is required.'))
        process.exit(1)
      }

      const result = await fetchFromEtherscan(chainId!, apiKey, options.address, 'getsourcecode') as EtherscanSourceEnvelope

      const raw = result.rawResult
      const parsed = result.parsedSource

      // Extract compiler version with commit from metadata when available
      const compilerVersion = (raw?.CompilerVersion as string | undefined) || ''
      const optimizationUsed = (raw?.OptimizationUsed as string | undefined) || ''
      const runsStr = (raw?.Runs as string | undefined) || ''
      const evmVersionRaw = (raw?.EVMVersion as string | undefined) || ''
      const isStandardJson = !!(parsed && typeof parsed === 'object' && 'language' in parsed && 'sources' in parsed)

      // If we have a standard JSON input, use it; otherwise build one from flattened source
      type SolcInput = {
        language: string
        sources: Record<string, { content?: string }>
        settings?: {
          optimizer?: { enabled?: boolean; runs?: number }
          evmVersion?: string
          outputSelection?: Record<string, Record<string, string[]>>
          viaIR?: boolean
          libraries?: Record<string, Record<string, string>>
        }
      }
      let input: SolcInput
      if (isStandardJson) {
        input = parsed as SolcInput
        // Ensure outputSelection includes required entries to get creation bytecode and metadata
        const currentSel = (input.settings?.outputSelection ?? {}) as Record<string, Record<string, string[]>>
        const mergedSel: Record<string, Record<string, string[]>> = {
          '*': {
            '*': Array.from(new Set<string>([
              ...((currentSel?.['*']?.['*']) || []),
              'abi',
              'evm.bytecode',
              'evm.deployedBytecode',
              'metadata',
              'userdoc',
              'devdoc',
              'evm.methodIdentifiers'
            ]))
          }
        }
        input.settings = {
          ...(input.settings || {}),
          outputSelection: mergedSel
        }
      } else {
        // Build a minimal standard JSON input from flattened source
        const flattened = String(parsed || '')
        input = {
          language: 'Solidity',
          sources: {
            'Flattened.sol': { content: flattened }
          },
          settings: {
            optimizer: {
              enabled: optimizationUsed === '1',
              runs: Number.isFinite(Number(runsStr)) ? Number(runsStr) : 200
            },
            evmVersion: evmVersionRaw && evmVersionRaw !== 'default' ? evmVersionRaw : undefined,
            outputSelection: {
              '*': {
                '*': [
                  'abi',
                  'evm.bytecode.object',
                  'evm.bytecode.sourceMap',
                  'evm.bytecode.linkReferences',
                  'evm.deployedBytecode.object',
                  'evm.deployedBytecode.sourceMap',
                  'evm.deployedBytecode.linkReferences',
                  'evm.deployedBytecode.immutableReferences',
                  'evm.methodIdentifiers',
                  'metadata'
                ]
              }
            }
          }
        }
      }

      // Compile with exact solc version when possible
      const solcInput = JSON.stringify(input)
      const versionTag = compilerVersion && compilerVersion.startsWith('v') ? compilerVersion : (compilerVersion ? `v${compilerVersion}` : '')
      let outputRaw: string
      if (versionTag) {
        outputRaw = await new Promise<string>((resolve, reject) => {
          // @ts-ignore - loadRemoteVersion exists in solc js
          solc.loadRemoteVersion(versionTag, (err: unknown, specificSolc: { compile: (input: string) => string } | undefined) => {
            if (err || !specificSolc) return reject((err as Error) || new Error('Failed to load solc version'))
            try {
              resolve(specificSolc.compile(solcInput))
            } catch (e) {
              reject(e)
            }
          })
        })
      } else {
        outputRaw = solc.compile(solcInput)
      }
      const output = JSON.parse(outputRaw)

      // Build build-info id as hex of sha1 of input
      const id = createHash('sha1').update(solcInput).digest('hex')

      // Determine solc versions
      const solcLongVersion = (output?.compiler?.version as string | undefined) || (compilerVersion ? compilerVersion.replace(/^v/, '') : undefined)
      const solcMaybe = solc as unknown as { version?: () => string }
      const solcVersion = (solcLongVersion || '').split('+')[0] || (typeof solcMaybe.version === 'function' ? solcMaybe.version() : 'unknown')

      // Augment settings with defaults similar to reference format
      const basePath = process.cwd()
      const includePaths = [basePath]
      const allowPaths = includePaths

      const buildInfo = {
        id,
        source_id_to_path: Object.fromEntries(Object.keys(input.sources).map((p, i) => [String(i), p])),
        language: input.language,
        _format: 'ethers-rs-sol-build-info-1',
        input: {
          version: solcVersion,
          language: input.language,
          sources: input.sources,
          settings: input.settings,
          evmVersion: input.settings?.evmVersion || 'cancun',
          viaIR: input.settings?.viaIR || false,
          libraries: input.settings?.libraries || {}
        },
        allowPaths,
        basePath,
        includePaths,
        output: {
          contracts: output.contracts || {},
          sources: output.sources || {}
        },
        solcLongVersion: solcLongVersion || solcVersion,
        solcVersion: solcVersion
      }

      // Print build-info JSON
      console.log(options.raw ? JSON.stringify(buildInfo) : JSON.stringify(buildInfo, null, 2))
    } catch (error) {
      console.error(chalk.red('Error fetching source from Etherscan:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  etherscan.addCommand(abi)
  etherscan.addCommand(source)
  return etherscan
}