import { Command } from 'commander'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { ProjectLoader, ProjectLoaderOptions } from '../lib/core/loader'
import { deploymentEvents } from '../lib/events'

/**
 * Adds the --project option to a command.
 */
export const projectOption = (cmd: Command): Command =>
  cmd.option('-p, --project <path>', 'Project root directory', process.cwd())

/**
 * Adds the --dotenv option to a command.
 */
export const dotenvOption = (cmd: Command): Command =>
  cmd.option('--dotenv <path>', 'Path to a custom .env file')

/**
 * Adds the --no-std option to a command.
 */
export const noStdOption = (cmd: Command): Command =>
  cmd.option('--no-std', 'Disable loading built-in standard templates')

/**
 * Adds verbosity options to a command.
 */
export const verbosityOption = (cmd: Command): Command =>
  cmd.option('-v, --verbose', 'Enable verbose logging (use -vv or -vvv for more detail)', (_, previous) => (previous || 0) + 1, 0)

/**
 * Adds the --config option to a command.
 */
export const configOption = (cmd: Command): Command =>
  cmd.option('--config <path>', 'Path to plugin configuration file (catapult.config.{js|ts|json|yml})')

/**
 * Loads the project using the ProjectLoader and emits corresponding events.
 */
export async function loadProject(projectRoot: string, options?: ProjectLoaderOptions): Promise<ProjectLoader> {
  deploymentEvents.emitEvent({
    type: 'project_loading_started',
    level: 'info',
    data: { projectRoot }
  })
  
  const loader = new ProjectLoader(projectRoot, options)
  await loader.load()
  
  deploymentEvents.emitEvent({
    type: 'project_loaded',
    level: 'info',
    data: {
      jobCount: loader.jobs.size,
      templateCount: loader.templates.size
    }
  })
  return loader
}

/**
 * Loads environment variables from the specified .env file path.
 */
export function loadDotenv(options: { dotenv?: string }): void {
  const dotenvPath = options.dotenv ? path.resolve(options.dotenv) : path.resolve(process.cwd(), '.env')
  dotenv.config({ path: dotenvPath })
}