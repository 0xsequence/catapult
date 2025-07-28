import { Command } from 'commander'
import { makeRunCommand, makeDryRunCommand, makeListCommand } from './commands'

export function setupCommands(program: Command): void {
  program.addCommand(makeRunCommand())
  program.addCommand(makeDryRunCommand())
  program.addCommand(makeListCommand())
}