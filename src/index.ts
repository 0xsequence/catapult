#!/usr/bin/env node

import { program } from 'commander'
import chalk from 'chalk'
import { setupCommands } from './cli'
import packageJson from '../package.json'

// Setup global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason)
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error)
  process.exit(1)
})

async function main() {
  try {
    // Configure the main program
    program
      .name('deployito')
      .description('Ethereum contract deployment CLI tool')
      .version(packageJson.version)

    // Setup all commands
    setupCommands(program)

    // Parse arguments
    await program.parseAsync(process.argv)
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main() 