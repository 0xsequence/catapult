import { Command } from 'commander'
import { makeRunCommand, makeDryRunCommand, makeListCommand, makeUtilsCommand } from './commands'
import { makeEtherscanCommand } from './commands/etherscan'

export function setupCommands(program: Command): void {
  // Make run the default command when no subcommand is provided
  program.addCommand(makeRunCommand(), {
    isDefault: true,
    hidden: false // Keep it visible in help
  })
  
  // Add other commands as subcommands
  program.addCommand(makeDryRunCommand())
  program.addCommand(makeListCommand())
  program.addCommand(makeUtilsCommand())
  program.addCommand(makeEtherscanCommand())
}