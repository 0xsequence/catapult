import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import {
  collectSourceProvenanceEntries,
  generateBuildInfoFromSourceProvenance,
  verifySourceProvenance
} from '../provenance'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd })
  return String(result.stdout).trim()
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

function sourceYaml(repo: string, commit: string, build: string): string {
  return `
type: source
build_info:
  "./stage1.json":
    repo: ${JSON.stringify(repo)}
    commit: ${JSON.stringify(commit)}
    build: ${JSON.stringify(build)}
`
}

function jobYaml(name: string, dependsOn: string[] = []): string {
  const depends = dependsOn.length > 0 ? `depends_on: ${JSON.stringify(dependsOn)}\n` : ''
  return `
name: ${JSON.stringify(name)}
version: "1.0.0"
${depends}actions:
  - name: "noop"
    type: "static"
    arguments:
      value: true
`
}

describe('source provenance operations', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'catapult-provenance-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('collects source provenance entries even when build-info is missing', async () => {
    const projectRoot = path.join(tempDir, 'project')
    const sourcePath = path.join(projectRoot, 'jobs', 'demo', 'build-info', 'source.yaml')
    await writeFile(sourcePath, sourceYaml('https://github.com/example/repo', 'abc123', 'forge build --build-info'))

    const result = await collectSourceProvenanceEntries(projectRoot)

    expect(result.warnings).toEqual([])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      sourceDocumentPath: sourcePath,
      buildInfoRef: './stage1.json',
      buildInfoPath: path.join(projectRoot, 'jobs', 'demo', 'build-info', 'stage1.json')
    })
  })

  it('can scope provenance entries to a job and its dependencies', async () => {
    const projectRoot = path.join(tempDir, 'project')
    await writeFile(path.join(projectRoot, 'jobs', 'base.yaml'), jobYaml('base'))
    await writeFile(path.join(projectRoot, 'jobs', 'child.yaml'), jobYaml('child', ['base']))
    await writeFile(path.join(projectRoot, 'jobs', 'base', 'build-info', 'source.yaml'), sourceYaml('https://github.com/example/base', 'abc123', 'build-base'))
    await writeFile(path.join(projectRoot, 'jobs', 'child', 'build-info', 'source.yaml'), sourceYaml('https://github.com/example/child', 'def456', 'build-child'))

    const childOnly = await collectSourceProvenanceEntries(projectRoot, {
      jobs: ['child'],
      loadStdTemplates: false
    })
    const withDependencies = await collectSourceProvenanceEntries(projectRoot, {
      jobs: ['child'],
      includeDependencies: true,
      loadStdTemplates: false
    })

    expect(childOnly.entries.map(entry => entry.provenance.repo)).toEqual(['https://github.com/example/child'])
    expect(withDependencies.entries.map(entry => entry.provenance.repo).sort()).toEqual([
      'https://github.com/example/base',
      'https://github.com/example/child'
    ])
  })

  it('generates missing build-info from a local Git provenance repo', async () => {
    const { projectRoot, expectedBuildInfo } = await createProjectWithLocalProvenanceRepo()

    const result = await generateBuildInfoFromSourceProvenance(projectRoot)
    const generatedPath = path.join(projectRoot, 'jobs', 'demo', 'build-info', 'stage1.json')
    const generatedJson = JSON.parse(await fs.readFile(generatedPath, 'utf-8'))

    expect(result.results).toHaveLength(1)
    expect(result.results[0].status).toBe('generated')
    expect(generatedJson).toEqual(expectedBuildInfo)
  })

  it('verifies generated build-info and reports mismatches', async () => {
    const { projectRoot } = await createProjectWithLocalProvenanceRepo()
    const targetPath = path.join(projectRoot, 'jobs', 'demo', 'build-info', 'stage1.json')

    await generateBuildInfoFromSourceProvenance(projectRoot)
    const verified = await verifySourceProvenance(projectRoot)
    expect(verified.results[0].status).toBe('verified')

    const changed = JSON.parse(await fs.readFile(targetPath, 'utf-8'))
    changed.solcVersion = '0.8.1'
    await fs.writeFile(targetPath, JSON.stringify(changed, null, 2))

    const mismatch = await verifySourceProvenance(projectRoot)
    expect(mismatch.results[0].status).toBe('failed')
    expect(mismatch.results[0].message).toContain('does not match')
    expect(mismatch.results[0].message).toContain('$.solcVersion')
  })

  it('normalizes checkout-local build-info paths and top-level ids while verifying', async () => {
    const { projectRoot } = await createProjectWithLocalProvenanceRepo({ checkoutSensitiveBuildInfo: true })
    const targetPath = path.join(projectRoot, 'jobs', 'demo', 'build-info', 'stage1.json')

    await generateBuildInfoFromSourceProvenance(projectRoot)
    const generatedJson = JSON.parse(await fs.readFile(targetPath, 'utf-8'))
    expect(generatedJson.id).toContain('catapult-provenance-')
    expect(generatedJson.input.basePath).toContain('catapult-provenance-')

    const verified = await verifySourceProvenance(projectRoot)
    expect(verified.results[0].status).toBe('verified')
  })

  async function createProjectWithLocalProvenanceRepo(
    options: { checkoutSensitiveBuildInfo?: boolean } = {}
  ): Promise<{ projectRoot: string; expectedBuildInfo: Record<string, unknown> }> {
    const sourceRepo = path.join(tempDir, 'source-repo')
    const projectRoot = path.join(tempDir, 'project')
    await fs.mkdir(sourceRepo, { recursive: true })

    const expectedBuildInfo = {
      _format: 'hh-sol-build-info-1',
      id: 'stage1',
      solcVersion: '0.8.0',
      input: {
        language: 'Solidity',
        sources: {}
      },
      output: {
        contracts: {}
      }
    }

    const buildInfoScript = options.checkoutSensitiveBuildInfo
      ? `
const fs = require('fs')
const path = require('path')
const buildInfo = {
  _format: 'hh-sol-build-info-1',
  id: path.basename(path.dirname(__dirname)),
  solcVersion: '0.8.0',
  input: {
    language: 'Solidity',
    basePath: __dirname,
    allowPaths: [__dirname, path.join(__dirname, 'lib')],
    includePaths: [__dirname],
    sources: {}
  },
  output: {
    contracts: {}
  }
}
fs.mkdirSync(path.join(__dirname, 'out', 'build-info'), { recursive: true })
fs.writeFileSync(path.join(__dirname, 'out', 'build-info', 'stage1.json'), JSON.stringify(buildInfo, null, 2))
`
      : `
const fs = require('fs')
const path = require('path')
fs.mkdirSync(path.join(__dirname, 'out', 'build-info'), { recursive: true })
fs.writeFileSync(path.join(__dirname, 'out', 'build-info', 'stage1.json'), JSON.stringify(${JSON.stringify(expectedBuildInfo)}, null, 2))
`

    await writeFile(path.join(sourceRepo, 'build-info.js'), `
${buildInfoScript.trim()}
`)
    await git(sourceRepo, ['init'])
    await git(sourceRepo, ['config', 'user.email', 'catapult@example.com'])
    await git(sourceRepo, ['config', 'user.name', 'Catapult Test'])
    await git(sourceRepo, ['add', 'build-info.js'])
    await git(sourceRepo, ['commit', '-m', 'add build script'])
    const commit = await git(sourceRepo, ['rev-parse', 'HEAD'])

    await writeFile(
      path.join(projectRoot, 'jobs', 'demo', 'build-info', 'source.yaml'),
      sourceYaml(sourceRepo, commit, 'node build-info.js')
    )

    return { projectRoot, expectedBuildInfo }
  }
})
