import { Command } from 'commander'
import chalk from 'chalk'
import * as fs from 'fs'
import * as path from 'path'
import { projectOption, verbosityOption } from './common'
import { loadNetworks } from '../lib/network-loader'
import { setVerbosity } from '../index'

interface UtilsOptions {
  project: string
  verbose: number
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
                } else if (value && typeof value === 'object' && typeof (value as any).address === 'string' && addressRegex.test((value as any).address)) {
                  address = (value as any).address
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

  return utils
}