#!/usr/bin/env node

import { program } from 'commander'
import chalk from 'chalk'
import { setupCommands } from './cli'
import packageJson from '../package.json'

import { deploymentEvents, CLIEventAdapter, VerbosityLevel } from './lib/events'

// Set up CLI event adapter to convert events to console output
const cliAdapter = new CLIEventAdapter(deploymentEvents)

// Export function to update CLI verbosity
export function setVerbosity(level: VerbosityLevel): void {
  cliAdapter.setVerbosity(level)
}

// Setup global error handling
process.on('unhandledRejection', (reason, promise) => {
  deploymentEvents.emitEvent({
    type: 'unhandled_rejection',
    level: 'error',
    data: {
      reason,
      promise
    }
  })
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  deploymentEvents.emitEvent({
    type: 'uncaught_exception',
    level: 'error',
    data: {
      error
    }
  })
  process.exit(1)
})

// Long option aliases, rewritten to their canonical flag before parsing
const OPTION_ALIASES = new Map([
  ['--networks', '--network']
])

function mapAliases(argv: string[]): string[] {
  return argv.map(arg => {
    const [flag, ...value] = arg.split('=')
    const canonical = OPTION_ALIASES.get(flag)
    return canonical === undefined ? arg : [canonical, ...value].join('=')
  })
}

async function main() {
  try {
    // Configure the main program
    program
      .name('catapult')
      .description('Ethereum contract deployment CLI tool')
      .version(packageJson.version)

    // Setup all commands
    setupCommands(program)

    // Parse arguments
    await program.parseAsync(mapAliases(process.argv))
  } catch (error) {
    deploymentEvents.emitEvent({
      type: 'cli_error',
      level: 'error',
      data: {
        message: error instanceof Error ? error.message : String(error)
      }
    })
    process.exit(1)
  }
}

main() 