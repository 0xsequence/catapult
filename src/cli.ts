import { Command } from 'commander'
import { makeRunCommand, makeDryRunCommand, makeListCommand, makeUtilsCommand } from './commands'

export function setupCommands(program: Command): void {
  program.addCommand(makeRunCommand())
  program.addCommand(makeDryRunCommand())
  program.addCommand(makeListCommand())
  program.addCommand(makeUtilsCommand())
}