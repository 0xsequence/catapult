import { Command } from 'commander'
import chalk from 'chalk'
import { loadNetworks } from '../lib/network-loader'
import { projectOption, verbosityOption } from './common'
import { setVerbosity } from '../index'

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

async function fetchFromEtherscan(
  chainId: number,
  apiKey: string,
  address: string,
  action: ApiAction
): Promise<unknown> {
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
    const sourceCodeRaw = (data.result as Array<{ SourceCode?: string }>)[0]?.SourceCode as string
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
      return JSON.parse(cleaned)
    } catch {
      // Not JSON, return as-is string
      return sourceCodeRaw
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
      .option('-n, --network <chainId>', 'Target network chain ID (required to select proper Etherscan endpoint)')
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
      if (options.network) {
        const parsed = Number(options.network)
        if (Number.isNaN(parsed)) {
          console.error(chalk.red('Invalid --network value. Must be a chain ID number.'))
          process.exit(1)
        }
        chainId = parsed
      } else {
        // If network not provided, try to infer: if only one network configured, use it
        const networks = await loadNetworks(options.project)
        if (networks.length === 1) {
          chainId = networks[0].chainId
        } else {
          console.error(chalk.red('Please provide --network <chainId> (multiple or zero networks configured).'))
          process.exit(1)
        }
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
    .description('Fetch contract source (standard-json or flattened) from Etherscan and print to stdout')
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
      if (options.network) {
        const parsed = Number(options.network)
        if (Number.isNaN(parsed)) {
          console.error(chalk.red('Invalid --network value. Must be a chain ID number.'))
          process.exit(1)
        }
        chainId = parsed
      } else {
        const networks = await loadNetworks(options.project)
        if (networks.length === 1) {
          chainId = networks[0].chainId
        } else {
          console.error(chalk.red('Please provide --network <chainId> (multiple or zero networks configured).'))
          process.exit(1)
        }
      }

      const result = await fetchFromEtherscan(chainId!, apiKey, options.address, 'getsourcecode')

      if (typeof result === 'string') {
        // flattened source string
        process.stdout.write(options.raw ? result : `${result}\n`)
      } else {
        // JSON object (standard-json-input)
        if (options.raw) {
          process.stdout.write(JSON.stringify(result))
        } else {
          console.log(JSON.stringify(result, null, 2))
        }
      }
    } catch (error) {
      console.error(chalk.red('Error fetching source from Etherscan:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  etherscan.addCommand(abi)
  etherscan.addCommand(source)
  return etherscan
}