import { Command } from 'commander'
import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import { projectOption, verbosityOption } from './common'
import { loadNetworks } from '../lib/network-loader'
import { setVerbosity } from '../index'
import {
  createSafeTransactionBuilderBatch,
  extractSafeTransactionsFromJobOutput,
  ExtractedSafeTransaction,
} from '../lib/safe'

interface UtilsOptions {
  project: string
  verbose: number
}

interface SafeBatchOptions {
  chainId: string
  safe?: string
  transaction?: string[]
  name: string
  description?: string
  output?: string
}

function findJsonFiles(inputPath: string): string[] {
  const absolutePath = path.resolve(inputPath)
  if (!fs.existsSync(absolutePath)) throw new Error(`Output path not found: ${absolutePath}`)

  const stat = fs.statSync(absolutePath)
  if (stat.isFile()) {
    if (!absolutePath.toLowerCase().endsWith('.json')) {
      throw new Error(`Output file must be JSON: ${absolutePath}`)
    }
    return [absolutePath]
  }
  if (!stat.isDirectory()) throw new Error(`Output path is not a file or directory: ${absolutePath}`)

  const files: string[] = []
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory).sort()) {
      const fullPath = path.join(directory, entry)
      const entryStat = fs.statSync(fullPath)
      if (entryStat.isDirectory()) walk(fullPath)
      else if (entryStat.isFile() && entry.toLowerCase().endsWith('.json')) files.push(fullPath)
    }
  }
  walk(absolutePath)
  return files
}

function selectSafeTransactions(
  transactions: ExtractedSafeTransaction[],
  selectors?: string[],
): ExtractedSafeTransaction[] {
  if (!selectors || selectors.length === 0) {
    if (transactions.length === 1) return transactions
    const available = transactions.map(({ selector }) => selector).join(', ')
    throw new Error(`Found ${transactions.length} Safe transactions. Pass --transaction in execution order. Available: ${available}`)
  }

  const seen = new Set<string>()
  return selectors.map((selector) => {
    if (seen.has(selector)) throw new Error(`Safe transaction selected more than once: ${selector}`)
    seen.add(selector)
    const matches = transactions.filter((transaction) => transaction.selector === selector)
    if (matches.length === 0) throw new Error(`Safe transaction not found: ${selector}`)
    if (matches.length > 1) throw new Error(`Safe transaction selector is ambiguous: ${selector}`)
    return matches[0]
  })
}

export function makeUtilsCommand(): Command {
  const utils = new Command('utils')
    .description('Utility commands for project management')

  const chainIdToName = new Command('chain-id-to-name')
    .description('Convert a chain ID to network name')
  projectOption(chainIdToName)
  verbosityOption(chainIdToName)

  chainIdToName.argument('<chain-id>', 'The chain ID to convert')
  chainIdToName.action(async (chainId: string, options: UtilsOptions) => {
    try {
      // Set verbosity level for logging
      setVerbosity(options.verbose as 0 | 1 | 2 | 3)
      
      const chainIdNumber = parseInt(chainId, 10)
      if (isNaN(chainIdNumber)) {
        console.error(chalk.red('Invalid chain ID. Please provide a valid number.'))
        process.exit(1)
      }

      const networks = await loadNetworks(options.project)
      
      const network = networks.find(n => n.chainId === chainIdNumber)
      
      if (network) {
        console.log(network.name)
      } else {
        console.error(chalk.red(`No network found with chain ID ${chainIdNumber}`))
        process.exit(1)
      }
    } catch (error) {
      console.error(chalk.red('Error converting chain ID to network name:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  utils.addCommand(chainIdToName)

  // utils gen-table <output-dir>
  const genTable = new Command('gen-table')
    .description('Generate a consolidated addresses table from an output directory')
    .argument('<output-dir>', 'Directory containing job output JSON files (searches recursively)')
    .option('--name', 'Include Name column', true)
    .option('--key', 'Include Key column', false)
    .option('--file', 'Include File column', false)
    .option('--chain-ids, --chainIds', 'Include ChainIds column', false)
    .option('--job', 'Include Job column', true)
    .option('--address', 'Include Address column', true)
    .option('--format <format>', "Output format: 'markdown' or 'ascii' (default)", 'ascii')
    .action(async (outputDir: string, options: { name?: boolean; key?: boolean; file?: boolean; chainIds?: boolean; job?: boolean; address?: boolean; format?: string }) => {
      try {
        const absoluteDir = path.resolve(outputDir)
        if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
          console.error(chalk.red(`Output directory not found or not a directory: ${absoluteDir}`))
          process.exit(1)
        }

        const jsonFiles: string[] = []
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir)) {
            const full = path.join(dir, entry)
            const stat = fs.statSync(full)
            if (stat.isDirectory()) walk(full)
            else if (stat.isFile() && entry.toLowerCase().endsWith('.json')) jsonFiles.push(full)
          }
        }
        walk(absoluteDir)

        type Row = { job: string; chainIds: string; name: string; address: string; key: string; file: string }
        const rows: Row[] = []
        const addressRegex = /^0x[a-fA-F0-9]{40}$/

        const toTitleCase = (slug: string): string => slug.split(/[-_\s]+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
        const extractVersionSuffix = (jobName: string): string => {
          const m = jobName.match(/[-_]?v(\d+)/i)
          return m ? `V${m[1]}` : ''
        }
        const deriveName = (jobName: string, key: string): string => {
          const version = extractVersionSuffix(jobName)
          const baseJob = jobName.replace(/[-_]?v\d+$/i, '')
          const keyCore = key.replace(/\.address$/i, '')
          // Prefer descriptive key name; if too generic like 'factory', prefix with job base
          const isGeneric = /^(factory|address)$/i.test(keyCore)
          const nameCore = isGeneric ? `${toTitleCase(baseJob)} ${toTitleCase(keyCore)}` : toTitleCase(keyCore)
          return `${nameCore.replace(/\s+/g, '')}${version}`
        }

        for (const file of jsonFiles) {
          try {
            const raw = fs.readFileSync(file, 'utf8')
            const data = JSON.parse(raw)
            if (!data || typeof data !== 'object' || !Array.isArray(data.networks)) continue
            const jobName: string = data.jobName ?? path.basename(file, '.json')
            for (const net of data.networks) {
              if (!net || typeof net !== 'object') continue
              const outputs = net.outputs as Record<string, unknown> | undefined
              if (!outputs) continue
              const chainIds: string[] = Array.isArray(net.chainIds) ? net.chainIds : []
              for (const [key, value] of Object.entries(outputs)) {
                let address: string | undefined
                if (typeof value === 'string' && addressRegex.test(value)) {
                  address = value
                } else if (value && typeof value === 'object' && 'address' in value && typeof value.address === 'string' && addressRegex.test(value.address)) {
                  address = value.address
                }
                if (!address) continue
                rows.push({
                  job: jobName,
                  chainIds: chainIds.join(','),
                  name: deriveName(jobName, key),
                  address,
                  key,
                  file
                })
              }
            }
          } catch {
            // skip invalid JSON
          }
        }

        rows.sort((a, b) => a.job.localeCompare(b.job) || a.name.localeCompare(b.name))

        if (rows.length === 0) {
          console.log(chalk.yellow('No address entries found.'))
          return
        }

        // Determine which columns to show
        const showJob = !!options.job
        const showAddress = !!options.address
        const showName = !!options.name
        const showKey = !!options.key
        const showChainIds = !!options.chainIds
        const showFile = !!options.file

        const selectedHeaders: (keyof Row)[] = []
        if (showJob) selectedHeaders.push('job')
        if (showChainIds) selectedHeaders.push('chainIds')
        if (showName) selectedHeaders.push('name')
        if (showAddress) selectedHeaders.push('address')
        if (showKey) selectedHeaders.push('key')
        if (showFile) selectedHeaders.push('file')

        // Titles for columns
        const titles: Record<keyof Row, string> = {
          job: 'Job',
          chainIds: 'ChainIds',
          name: 'Name',
          address: 'Address',
          key: 'Key',
          file: 'File'
        }
        const format = String(options.format || 'markdown').toLowerCase()
        if (format !== 'markdown' && format !== 'ascii') {
          console.error(chalk.red("Invalid format. Use 'markdown' or 'ascii'."))
          process.exit(1)
        }

        if (format === 'markdown') {
          const header = '| ' + selectedHeaders.map(h => titles[h]).join(' | ') + ' |'
          const sepMd = '| ' + selectedHeaders.map(h => '-'.repeat(Math.max(3, String(titles[h]).length))).join(' | ') + ' |'
          console.log(header)
          console.log(sepMd)
          for (const r of rows) {
            console.log('| ' + selectedHeaders.map(h => String(r[h])).join(' | ') + ' |')
          }
        } else {
          // ascii rendering with box-drawing characters
          const widths: Record<string, number> = {}
          for (const h of selectedHeaders) {
            widths[h] = Math.max(titles[h].length, ...rows.map(r => String(r[h]).length))
          }
          const makeSep = (left: string, mid: string, right: string, fill: string) => {
            return left + selectedHeaders.map(h => fill.repeat(widths[h] + 2)).join(mid) + right
          }
          const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length))

          const top = makeSep('┌', '┬', '┐', '─')
          const sep = makeSep('├', '┼', '┤', '─')
          const bot = makeSep('└', '┴', '┘', '─')
          const headerLine = '│' + selectedHeaders.map(h => ' ' + pad(titles[h], widths[h]) + ' ').join('│') + '│'
          const lines = rows.map(r => '│' + selectedHeaders.map(h => ' ' + pad(String(r[h]), widths[h]) + ' ').join('│') + '│')

          console.log(top)
          console.log(headerLine)
          console.log(sep)
          for (const line of lines) console.log(line)
          console.log(bot)
        }

      } catch (error) {
        console.error(chalk.red('Error generating table:'), error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  utils.addCommand(genTable)

  const safeBatch = new Command('safe-batch')
    .description('Export first-class Safe transaction outputs as a Safe Transaction Builder JSON file')
    .argument('<output-path>', 'Catapult job output JSON file or directory')
    .requiredOption('--chain-id <chain-id>', 'Chain ID to export')
    .option('--safe <address>', 'Only export transactions for this Safe address')
    .option('--transaction <selector...>', 'Transactions in batch order, as job/action selectors')
    .option('--name <name>', 'Batch name', 'Catapult Safe transactions')
    .option('--description <description>', 'Batch description')
    .option('-o, --output <file>', 'Write to a file instead of stdout')
    .action(async (outputPath: string, options: SafeBatchOptions) => {
      try {
        if (!/^\d+$/.test(options.chainId)) throw new Error(`Invalid chain ID: ${options.chainId}`)

        const transactions: ExtractedSafeTransaction[] = []
        for (const file of findJsonFiles(outputPath)) {
          let document: unknown
          try {
            document = JSON.parse(fs.readFileSync(file, 'utf8'))
          } catch (error) {
            throw new Error(`Failed to parse ${file}: ${error instanceof Error ? error.message : String(error)}`)
          }
          transactions.push(...extractSafeTransactionsFromJobOutput(document, options.chainId))
        }

        if (transactions.length === 0) {
          throw new Error(`No Safe transactions found for chain ID ${options.chainId}`)
        }

        const candidates = options.safe
          ? transactions.filter(({ artifact }) => artifact.safe.toLowerCase() === options.safe!.toLowerCase())
          : transactions
        if (candidates.length === 0) {
          throw new Error(`No Safe transactions found for ${options.safe} on chain ID ${options.chainId}`)
        }
        const selected = selectSafeTransactions(candidates, options.transaction)

        const batch = createSafeTransactionBuilderBatch(
          selected.map(({ artifact }) => artifact),
          { name: options.name, description: options.description },
        )
        const serialized = `${JSON.stringify(batch, null, 2)}\n`

        if (options.output) {
          const destination = path.resolve(options.output)
          fs.writeFileSync(destination, serialized)
          console.log(destination)
        } else {
          process.stdout.write(serialized)
        }
      } catch (error) {
        console.error(chalk.red('Error exporting Safe batch:'), error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    })

  utils.addCommand(safeBatch)

  return utils
}
