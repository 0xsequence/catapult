import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { ProjectLoader } from '../../core/loader'
import { extractUsedProgramReferences, validateProgramReferences } from '../program-references'

async function makeProject(programReference: string, includeProgram: boolean): Promise<{ root: string; loader: ProjectLoader }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'catapult-program-refs-'))
  const jobsDir = path.join(root, 'jobs')
  await fs.mkdir(jobsDir, { recursive: true })
  await fs.writeFile(path.join(jobsDir, 'deploy.yaml'), `
name: "deploy-program"
version: "1"
actions:
  - name: "deploy"
    type: "svm-deploy-program"
    arguments:
      program: "{{Program(${programReference})}}"
      programKeypair: "./program-keypair.json"
`)
  if (includeProgram) {
    const deployDir = path.join(root, 'target', 'deploy')
    await fs.mkdir(deployDir, { recursive: true })
    await fs.writeFile(path.join(deployDir, 'counter.so'), Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  }
  const loader = new ProjectLoader(root, { loadStdTemplates: false, loadContracts: false })
  await loader.load()
  return { root, loader }
}

describe('SVM program reference validation', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
  })

  it('finds and validates Program(...) references', async () => {
    const { root, loader } = await makeProject('counter', true)
    roots.push(root)

    expect(extractUsedProgramReferences(loader)).toEqual([{
      reference: 'counter',
      location: expect.stringContaining("job 'deploy-program'"),
    }])
    expect(validateProgramReferences(loader)).toEqual([])
  })

  it('reports missing Program(...) artifacts with their action location', async () => {
    const { root, loader } = await makeProject('missing', false)
    roots.push(root)

    expect(validateProgramReferences(loader)).toEqual([{
      reference: 'missing',
      location: expect.stringContaining("action 1 'deploy'"),
    }])
  })
})
