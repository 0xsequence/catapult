import { Command } from 'commander'
import chalk from 'chalk'
import * as path from 'path'
import { loadProject, projectOption, noStdOption } from './common'
import { loadNetworks } from '../lib/network-loader'

interface ListOptions {
  project: string
  std: boolean
}

interface NetworksListOptions {
  project: string
}

export function makeListCommand(): Command {
  const list = new Command('list')
    .description('List project resources like jobs, artifacts, and networks')

  const listJobs = new Command('jobs')
    .description('List all available jobs in the project')
  projectOption(listJobs)
  noStdOption(listJobs)
  listJobs.action(async (options: ListOptions) => {
    try {
      const loader = await loadProject(options.project, { 
        loadStdTemplates: options.std !== false 
      })
      console.log(chalk.bold.underline('Available Jobs:'))
      if (loader.jobs.size === 0) {
        console.log(chalk.yellow('No jobs found in this project.'))
        return
      }
      for (const job of loader.jobs.values()) {
        console.log(`- ${chalk.cyan(job.name)} (v${job.version})`)
        if (job.description) {
          console.log(`  ${chalk.gray(job.description)}`)
        }
      }
    } catch (error) {
      console.error(chalk.red('Error listing jobs:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  const listArtifacts = new Command('artifacts')
    .description('List all artifacts found in the project')
  projectOption(listArtifacts)
  noStdOption(listArtifacts)
  listArtifacts.action(async (options: ListOptions) => {
    try {
      const loader = await loadProject(options.project, { 
        loadStdTemplates: options.std !== false 
      })
      console.log(chalk.bold.underline('Available Artifacts:'))
             const artifacts = loader.artifactRegistry.getAll()
      if (artifacts.length === 0) {
        console.log(chalk.yellow('No artifacts found in this project.'))
        return
      }
      for (const artifact of artifacts) {
        const relativePath = path.relative(options.project, artifact._path)
        console.log(`- ${chalk.cyan(artifact.contractName)}`)
        console.log(`  ${chalk.gray('Path:')} ${relativePath}`)
        console.log(`  ${chalk.gray('Hash:')} ${artifact._hash}`)
      }
    } catch (error) {
      console.error(chalk.red('Error listing artifacts:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  const listTemplates = new Command('templates')
    .description('List all available templates')
  projectOption(listTemplates)
  noStdOption(listTemplates)
  listTemplates.action(async (options: ListOptions) => {
    try {
      const loader = await loadProject(options.project, { 
        loadStdTemplates: options.std !== false 
      })
      console.log(chalk.bold.underline('Available Templates:'))
      if (loader.templates.size === 0) {
        console.log(chalk.yellow('No templates found.'))
        return
      }
      for (const template of loader.templates.values()) {
        console.log(`- ${chalk.cyan(template.name)}`)
        if (template.description) {
          console.log(`  ${chalk.gray(template.description)}`)
        }
      }
    } catch (error) {
      console.error(chalk.red('Error listing templates:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  const listNetworks = new Command('networks')
    .description('List all configured networks')
  projectOption(listNetworks)
  listNetworks.action(async (options: NetworksListOptions) => {
    try {
      const networks = await loadNetworks(options.project)
      console.log(chalk.bold.underline('Available Networks:'))
      if (networks.length === 0) {
        console.log(chalk.yellow('No networks configured. Create a networks.yaml file in your project root.'))
        return
      }
      for (const network of networks) {
        console.log(`- ${chalk.cyan(network.name)} (Chain ID: ${network.chainId})`)
        console.log(`  ${chalk.gray(`RPC: ${network.rpcUrl}`)}`)
      }
    } catch (error) {
      console.error(chalk.red('Error listing networks:'), error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

  list.addCommand(listJobs)
  list.addCommand(listArtifacts)
  list.addCommand(listTemplates)
  list.addCommand(listNetworks)

  return list
}