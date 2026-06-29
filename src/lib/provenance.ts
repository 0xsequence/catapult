import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { DependencyGraph } from './core/graph'
import { ProjectLoader } from './core/loader'
import { parseSourceDocument } from './parsers/source'
import { isBuildInfoFile } from './parsers/buildinfo'
import { BuildInfoSourceProvenance } from './types/source'
import { Job } from './types'

const execFileAsync = promisify(execFile)
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])
const COMMAND_MAX_BUFFER = 20 * 1024 * 1024
const BUILD_INFO_ID_PLACEHOLDER = '<build-info-id>'
const BUILD_INFO_BASE_PATH_PLACEHOLDER = '<build-info-base-path>'
const CATAPULT_CHECKOUT_PATH_PATTERN = /(?:[A-Za-z]:)?[/\\](?:[^/\\]+[/\\])*catapult-provenance-[^/\\]+[/\\]repo(?=[/\\]|$)/g

export interface SourceProvenanceEntry {
  sourceDocumentPath: string
  buildInfoRef: string
  buildInfoPath: string
  provenance: BuildInfoSourceProvenance
}

export interface CollectProvenanceOptions {
  jobs?: string[]
  includeDependencies?: boolean
  loadStdTemplates?: boolean
}

export interface ProvenanceOperationOptions extends CollectProvenanceOptions {
  force?: boolean
}

export type ProvenanceOperationStatus = 'verified' | 'generated' | 'skipped' | 'failed'

export interface ProvenanceOperationResult {
  entry: SourceProvenanceEntry
  status: ProvenanceOperationStatus
  message: string
  generatedBuildInfoPath?: string
}

export interface ProvenanceRunResult {
  entries: SourceProvenanceEntry[]
  warnings: string[]
  results: ProvenanceOperationResult[]
}

interface BuildInfoCandidate {
  filePath: string
  relativePath: string
  content: string
  json: unknown
  id?: string
}

interface BuildOutput {
  tempDir: string
  checkoutDir: string
  head: string
  candidates: BuildInfoCandidate[]
}

interface JsonComparison {
  matches: boolean
  difference?: string
}

export async function collectSourceProvenanceEntries(
  projectRoot: string,
  options: CollectProvenanceOptions = {}
): Promise<{ entries: SourceProvenanceEntry[]; warnings: string[] }> {
  const absoluteProjectRoot = path.resolve(projectRoot)
  const sourceFiles = await findSourceFiles(absoluteProjectRoot)
  const warnings: string[] = []
  const entries: SourceProvenanceEntry[] = []

  for (const sourceFilePath of sourceFiles) {
    let sourceDocument
    try {
      const content = await fs.readFile(sourceFilePath, 'utf-8')
      sourceDocument = parseSourceDocument(content)
    } catch (error) {
      warnings.push(`Skipping source provenance file ${sourceFilePath}: ${formatError(error)}`)
      continue
    }

    if (!sourceDocument) {
      continue
    }

    for (const warning of sourceDocument.warnings || []) {
      warnings.push(`Skipping source provenance entry ${sourceFilePath}: ${warning}`)
    }

    const sourceDir = path.dirname(sourceFilePath)
    for (const [buildInfoRef, provenance] of Object.entries(sourceDocument.build_info)) {
      const buildInfoPath = path.resolve(sourceDir, buildInfoRef)
      if (!isBuildInfoFile(buildInfoPath)) {
        warnings.push(`Skipping source provenance entry ${sourceFilePath}: "${buildInfoRef}" does not point to a build-info JSON file.`)
        continue
      }

      entries.push({
        sourceDocumentPath: sourceFilePath,
        buildInfoRef,
        buildInfoPath,
        provenance
      })
    }
  }

  if (options.jobs && options.jobs.length > 0) {
    return {
      entries: await filterEntriesByJobs(absoluteProjectRoot, entries, options),
      warnings
    }
  }

  return { entries, warnings }
}

export async function verifySourceProvenance(
  projectRoot: string,
  options: CollectProvenanceOptions = {}
): Promise<ProvenanceRunResult> {
  const collected = await collectSourceProvenanceEntries(projectRoot, options)
  const buildCache = new Map<string, Promise<BuildOutput>>()
  const results: ProvenanceOperationResult[] = []

  try {
    for (const entry of collected.entries) {
      results.push(await verifySourceProvenanceEntry(entry, buildCache))
    }
  } finally {
    await cleanupBuildCache(buildCache)
  }

  return {
    ...collected,
    results
  }
}

export async function generateBuildInfoFromSourceProvenance(
  projectRoot: string,
  options: ProvenanceOperationOptions = {}
): Promise<ProvenanceRunResult> {
  const collected = await collectSourceProvenanceEntries(projectRoot, options)
  const buildCache = new Map<string, Promise<BuildOutput>>()
  const results: ProvenanceOperationResult[] = []

  try {
    for (const entry of collected.entries) {
      results.push(await generateBuildInfoForEntry(entry, buildCache, options.force === true))
    }
  } finally {
    await cleanupBuildCache(buildCache)
  }

  return {
    ...collected,
    results
  }
}

async function verifySourceProvenanceEntry(
  entry: SourceProvenanceEntry,
  buildCache: Map<string, Promise<BuildOutput>>
): Promise<ProvenanceOperationResult> {
  try {
    await assertPathExists(entry.buildInfoPath)
    const buildOutput = await getBuildOutput(entry, buildCache)
    const generated = await selectGeneratedBuildInfo(entry, buildOutput.candidates)
    const comparison = await compareJsonFiles(entry.buildInfoPath, generated)

    if (!comparison.matches) {
      return {
        entry,
        status: 'failed',
        message: `Committed build-info does not match generated ${generated.relativePath}.${comparison.difference ? ` First difference: ${comparison.difference}.` : ''}`,
        generatedBuildInfoPath: generated.filePath
      }
    }

    return {
      entry,
      status: 'verified',
      message: `Matches generated ${generated.relativePath} at ${shortCommit(buildOutput.head)}.`,
      generatedBuildInfoPath: generated.filePath
    }
  } catch (error) {
    return {
      entry,
      status: 'failed',
      message: formatError(error)
    }
  }
}

async function generateBuildInfoForEntry(
  entry: SourceProvenanceEntry,
  buildCache: Map<string, Promise<BuildOutput>>,
  force: boolean
): Promise<ProvenanceOperationResult> {
  try {
    if (!force && await pathExists(entry.buildInfoPath)) {
      return {
        entry,
        status: 'skipped',
        message: 'Build-info already exists. Use --force to overwrite it.'
      }
    }

    const buildOutput = await getBuildOutput(entry, buildCache)
    const generated = await selectGeneratedBuildInfo(entry, buildOutput.candidates)
    await fs.mkdir(path.dirname(entry.buildInfoPath), { recursive: true })
    await fs.writeFile(entry.buildInfoPath, generated.content)

    return {
      entry,
      status: 'generated',
      message: `Wrote build-info from generated ${generated.relativePath} at ${shortCommit(buildOutput.head)}.`,
      generatedBuildInfoPath: generated.filePath
    }
  } catch (error) {
    return {
      entry,
      status: 'failed',
      message: formatError(error)
    }
  }
}

async function getBuildOutput(
  entry: SourceProvenanceEntry,
  buildCache: Map<string, Promise<BuildOutput>>
): Promise<BuildOutput> {
  const key = buildCacheKey(entry.provenance)
  if (!buildCache.has(key)) {
    buildCache.set(key, buildFromSourceProvenance(entry.provenance))
  }
  return buildCache.get(key)!
}

async function buildFromSourceProvenance(provenance: BuildInfoSourceProvenance): Promise<BuildOutput> {
  if (!provenance.build) {
    throw new Error('source provenance is missing a build command.')
  }
  if (!provenance.commit && !provenance.ref) {
    throw new Error('source provenance must include either commit or ref.')
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'catapult-provenance-'))
  const checkoutDir = path.join(tempDir, 'repo')

  try {
    await runGit(['clone', '--', provenance.repo, checkoutDir])

    if (provenance.ref) {
      const refHead = await gitCommitForRevision(provenance.ref, checkoutDir)
      if (provenance.commit && !commitMatches(refHead, provenance.commit)) {
        throw new Error(`ref "${provenance.ref}" resolves to ${refHead}, not ${provenance.commit}.`)
      }
      await checkoutGitCommit(refHead, checkoutDir)
    } else if (provenance.commit) {
      const commitHead = await gitCommitForRevision(provenance.commit, checkoutDir)
      await checkoutGitCommit(commitHead, checkoutDir)
    }

    const head = await gitStdout(['rev-parse', 'HEAD'], checkoutDir)
    await runShell(provenance.build, checkoutDir)
    const candidates = await findBuildInfoCandidates(checkoutDir)

    if (candidates.length === 0) {
      throw new Error('build command did not produce any build-info JSON files.')
    }

    return {
      tempDir,
      checkoutDir,
      head,
      candidates
    }
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true })
    throw error
  }
}

async function cleanupBuildCache(buildCache: Map<string, Promise<BuildOutput>>): Promise<void> {
  const seen = new Set<string>()
  for (const buildOutputPromise of buildCache.values()) {
    try {
      const buildOutput = await buildOutputPromise
      if (!seen.has(buildOutput.tempDir)) {
        seen.add(buildOutput.tempDir)
        await fs.rm(buildOutput.tempDir, { recursive: true, force: true })
      }
    } catch {
      // Failed builds clean up their own temp directories.
    }
  }
}

async function findBuildInfoCandidates(root: string): Promise<BuildInfoCandidate[]> {
  const files = await findJsonFiles(root)
  const candidates: BuildInfoCandidate[] = []

  for (const filePath of files) {
    if (!isBuildInfoFile(filePath)) {
      continue
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const json = JSON.parse(content)
      candidates.push({
        filePath,
        relativePath: path.relative(root, filePath),
        content,
        json,
        id: getJsonId(json)
      })
    } catch {
      // Ignore invalid JSON files under build-info directories.
    }
  }

  return candidates
}

async function selectGeneratedBuildInfo(
  entry: SourceProvenanceEntry,
  candidates: BuildInfoCandidate[]
): Promise<BuildInfoCandidate> {
  if (candidates.length === 0) {
    throw new Error('build command did not produce any build-info JSON files.')
  }

  const existingJson = await readJsonIfExists(entry.buildInfoPath)
  const existingId = getJsonId(existingJson)
  const selectionIssues: string[] = []
  if (existingId) {
    const idMatches = candidates.filter(candidate => candidate.id === existingId)
    if (idMatches.length === 1) {
      return idMatches[0]
    }
    if (idMatches.length > 1) {
      selectionIssues.push(`${idMatches.length} candidates share id "${existingId}"`)
    }
  }

  const targetBaseName = path.basename(entry.buildInfoPath)
  const nameMatches = candidates.filter(candidate => path.basename(candidate.filePath) === targetBaseName)
  if (nameMatches.length === 1) {
    return nameMatches[0]
  }
  if (nameMatches.length > 1) {
    selectionIssues.push(`${nameMatches.length} candidates are named "${targetBaseName}"`)
  }

  if (candidates.length === 1) {
    return candidates[0]
  }

  throw new Error(
    `Generated ${candidates.length} build-info files and could not select one for "${entry.buildInfoRef}". ` +
    `${selectionIssues.length > 0 ? `${selectionIssues.join('; ')}. ` : ''}` +
    `Use a build command that emits one file or names the file "${targetBaseName}".`
  )
}

async function compareJsonFiles(existingPath: string, generated: BuildInfoCandidate): Promise<JsonComparison> {
  const existingRaw = await fs.readFile(existingPath, 'utf-8')
  const existingJson = JSON.parse(existingRaw)
  const normalizedExisting = sortJson(normalizeBuildInfoJson(existingJson))
  const normalizedGenerated = sortJson(normalizeBuildInfoJson(generated.json))

  if (JSON.stringify(normalizedExisting) === JSON.stringify(normalizedGenerated)) {
    return { matches: true }
  }

  return {
    matches: false,
    difference: findFirstJsonDifference(normalizedExisting, normalizedGenerated)
  }
}

async function filterEntriesByJobs(
  projectRoot: string,
  entries: SourceProvenanceEntry[],
  options: CollectProvenanceOptions
): Promise<SourceProvenanceEntry[]> {
  const loader = new ProjectLoader(projectRoot, {
    loadStdTemplates: options.loadStdTemplates,
    loadContracts: false
  })
  await loader.load()

  const graph = new DependencyGraph(loader.jobs, loader.templates)
  const selectedJobs = selectJobNames(loader.jobs, graph, options.jobs || [], options.includeDependencies === true)
  const scopeRoots = selectedJobs.flatMap(jobName => {
    const job = loader.jobs.get(jobName)
    return job ? jobScopeRoots(projectRoot, job) : []
  })

  return entries.filter(entry => scopeRoots.some(root =>
    isPathWithin(root, entry.sourceDocumentPath) || isPathWithin(root, entry.buildInfoPath)
  ))
}

function selectJobNames(
  jobs: Map<string, Job>,
  graph: DependencyGraph,
  patterns: string[],
  includeDependencies: boolean
): string[] {
  const allJobNames = Array.from(jobs.keys())
  const requested = new Set<string>()

  for (const pattern of patterns) {
    const matches = isPattern(pattern)
      ? allJobNames.filter(jobName => patternToRegex(pattern).test(jobName))
      : allJobNames.filter(jobName => jobName === pattern)

    if (matches.length === 0) {
      throw new Error(`Job "${pattern}" not found in project.`)
    }
    matches.forEach(match => requested.add(match))
  }

  const selected = new Set(requested)
  if (includeDependencies) {
    for (const jobName of requested) {
      graph.getDependencies(jobName).forEach(dep => selected.add(dep))
    }
  }

  return graph.getExecutionOrder().filter(jobName => selected.has(jobName))
}

function jobScopeRoots(projectRoot: string, job: Job): string[] {
  if (!job._path) {
    return []
  }

  const jobsRoot = path.resolve(projectRoot, 'jobs')
  const jobPath = path.resolve(job._path)
  const jobDir = path.dirname(jobPath)
  const jobBaseDir = path.join(jobDir, path.basename(jobPath, path.extname(jobPath)))

  if (path.normalize(jobDir) === path.normalize(jobsRoot)) {
    return [jobBaseDir]
  }

  return Array.from(new Set([jobDir, jobBaseDir]))
}

async function findSourceFiles(root: string): Promise<string[]> {
  const results: string[] = []
  await walk(root, async (filePath, direntName) => {
    if (direntName === 'source.yaml' || direntName === 'source.yml') {
      results.push(filePath)
    }
  })
  return results.sort()
}

async function findJsonFiles(root: string): Promise<string[]> {
  const results: string[] = []
  await walk(root, async (filePath, direntName) => {
    if (direntName.endsWith('.json')) {
      results.push(filePath)
    }
  })
  return results.sort()
}

async function walk(root: string, onFile: (filePath: string, direntName: string) => Promise<void>): Promise<void> {
  let dirents
  try {
    dirents = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const dirent of dirents) {
    const fullPath = path.resolve(root, dirent.name)
    if (dirent.isDirectory()) {
      if (!IGNORED_DIRS.has(dirent.name)) {
        await walk(fullPath, onFile)
      }
    } else if (dirent.isFile()) {
      await onFile(fullPath, dirent.name)
    }
  }
}

async function runGit(args: string[], cwd?: string): Promise<void> {
  try {
    await execFileAsync('git', args, { cwd, maxBuffer: COMMAND_MAX_BUFFER })
  } catch (error) {
    throw new Error(`git ${args.join(' ')} failed: ${commandErrorMessage(error)}`)
  }
}

async function gitStdout(args: string[], cwd: string): Promise<string> {
  try {
    const result = await execFileAsync('git', args, { cwd, maxBuffer: COMMAND_MAX_BUFFER })
    return String(result.stdout).trim()
  } catch (error) {
    throw new Error(`git ${args.join(' ')} failed: ${commandErrorMessage(error)}`)
  }
}

async function gitCommitForRevision(revision: string, cwd: string): Promise<string> {
  return gitStdout(['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], cwd)
}

async function checkoutGitCommit(commit: string, cwd: string): Promise<void> {
  await runGit(['checkout', '--detach', commit], cwd)
}

async function runShell(command: string, cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
      stdio: 'inherit'
    })

    child.on('error', error => {
      reject(new Error(`build command failed to start: ${error.message}`))
    })
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else if (signal) {
        reject(new Error(`build command failed: terminated by ${signal}`))
      } else {
        reject(new Error(`build command failed: exited with code ${code}`))
      }
    })
  })
}

async function assertPathExists(filePath: string): Promise<void> {
  if (!await pathExists(filePath)) {
    throw new Error(`build-info file does not exist: ${filePath}`)
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return undefined
  }
}

function getJsonId(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

function buildCacheKey(provenance: BuildInfoSourceProvenance): string {
  return JSON.stringify({
    repo: provenance.repo,
    ref: provenance.ref,
    commit: provenance.commit,
    build: provenance.build
  })
}

function normalizeBuildInfoJson(value: unknown): unknown {
  return normalizeBuildInfoValue(value, [], getBuildInfoBasePath(value))
}

function normalizeBuildInfoValue(value: unknown, pathSegments: string[], basePath?: string): unknown {
  if (pathSegments.length === 1 && pathSegments[0] === 'id') {
    return BUILD_INFO_ID_PLACEHOLDER
  }

  if (typeof value === 'string') {
    return normalizeBuildInfoString(value, basePath)
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeBuildInfoValue(item, [...pathSegments, String(index)], basePath))
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    return Object.fromEntries(Object.entries(objectValue).map(([key, item]) => [
      normalizeBuildInfoString(key, basePath),
      normalizeBuildInfoValue(item, [...pathSegments, key], basePath)
    ]))
  }

  return value
}

function normalizeBuildInfoString(value: string, basePath?: string): string {
  let normalized = value
  const basePathPattern = basePath && isAbsolutePath(basePath) ? pathPrefixPattern(basePath) : undefined

  if (basePathPattern) {
    normalized = normalized.replace(basePathPattern, BUILD_INFO_BASE_PATH_PLACEHOLDER)
  }

  return normalized.replace(CATAPULT_CHECKOUT_PATH_PATTERN, BUILD_INFO_BASE_PATH_PLACEHOLDER)
}

function getBuildInfoBasePath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const input = (value as { input?: unknown }).input
  if (!input || typeof input !== 'object') {
    return undefined
  }

  const basePath = (input as { basePath?: unknown }).basePath
  return typeof basePath === 'string' && basePath.length > 0 ? basePath : undefined
}

function pathPrefixPattern(value: string): RegExp | undefined {
  const hasLeadingSeparator = /^[\\/]/.test(value)
  const trimmed = value.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '')
  const segments = trimmed.split(/[\\/]+/).filter(Boolean)

  if (segments.length === 0) {
    return undefined
  }

  const source = `${hasLeadingSeparator ? '[/\\\\]+' : ''}${segments.map(escapeRegex).join('[/\\\\]+')}`
  return new RegExp(`${source}(?=[/\\\\]|$)`, 'g')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isAbsolutePath(value: string): boolean {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value)
}

function findFirstJsonDifference(existing: unknown, generated: unknown, location = '$'): string {
  if (Object.is(existing, generated)) {
    return ''
  }

  if (Array.isArray(existing) || Array.isArray(generated)) {
    if (!Array.isArray(existing) || !Array.isArray(generated)) {
      return `${location} type differs: committed ${jsonType(existing)}, generated ${jsonType(generated)}`
    }
    if (existing.length !== generated.length) {
      return `${location} length differs: committed ${existing.length}, generated ${generated.length}`
    }
    for (let i = 0; i < existing.length; i++) {
      const difference = findFirstJsonDifference(existing[i], generated[i], `${location}[${i}]`)
      if (difference) {
        return difference
      }
    }
    return ''
  }

  if (isRecord(existing) || isRecord(generated)) {
    if (!isRecord(existing) || !isRecord(generated)) {
      return `${location} type differs: committed ${jsonType(existing)}, generated ${jsonType(generated)}`
    }

    const keys = Array.from(new Set([...Object.keys(existing), ...Object.keys(generated)])).sort()
    for (const key of keys) {
      const nextLocation = jsonPath(location, key)
      if (!(key in existing)) {
        return `${nextLocation} is missing from committed build-info`
      }
      if (!(key in generated)) {
        return `${nextLocation} is missing from generated build-info`
      }

      const difference = findFirstJsonDifference(existing[key], generated[key], nextLocation)
      if (difference) {
        return difference
      }
    }

    return ''
  }

  return `${location} differs: committed ${formatJsonScalar(existing)}, generated ${formatJsonScalar(generated)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function jsonPath(location: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `${location}.${key}` : `${location}[${JSON.stringify(key)}]`
}

function jsonType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array'
  }
  if (value === null) {
    return 'null'
  }
  return typeof value
}

function formatJsonScalar(value: unknown): string {
  const formatted = JSON.stringify(value)
  return formatted && formatted.length > 120 ? `${formatted.slice(0, 117)}...` : formatted ?? String(value)
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson)
  }
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(objectValue).sort().map(key => [key, sortJson(objectValue[key])]))
  }
  return value
}

function isPathWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function isPattern(value: string): boolean {
  return /[*?]/.test(value)
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[-\\^$+?.()|[\]{}]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

function commitMatches(actual: string, expected: string): boolean {
  return actual === expected || actual.startsWith(expected)
}

function shortCommit(commit: string): string {
  return commit.slice(0, 12)
}

function commandErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const maybe = error as { message?: string; stderr?: string | Buffer; stdout?: string | Buffer }
    const stderr = maybe.stderr ? String(maybe.stderr).trim() : ''
    const stdout = maybe.stdout ? String(maybe.stdout).trim() : ''
    return stderr || stdout || maybe.message || String(error)
  }
  return String(error)
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
