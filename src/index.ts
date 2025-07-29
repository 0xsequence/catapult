#!/usr/bin/env node

import { program } from 'commander'
import chalk from 'chalk'
import { setupCommands } from './cli'
import packageJson from '../package.json'

import { deploymentEvents, CLIEventAdapter } from './lib/events'

// Set up CLI event adapter to convert events to console output
const cliAdapter = new CLIEventAdapter(deploymentEvents)

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
    await program.parseAsync(process.argv)
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