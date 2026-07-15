import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { SvmProgramRepository } from '../repository'

describe('SvmProgramRepository', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'catapult-svm-programs-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('discovers .so programs and pairs them with Anchor-style IDLs', async () => {
    const deployDir = path.join(tempDir, 'target', 'deploy')
    const idlDir = path.join(tempDir, 'target', 'idl')
    await fs.mkdir(deployDir, { recursive: true })
    await fs.mkdir(idlDir, { recursive: true })
    const binaryPath = path.join(deployDir, 'counter.so')
    const idlPath = path.join(idlDir, 'counter.json')
    await fs.writeFile(binaryPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3]))
    await fs.writeFile(idlPath, JSON.stringify({
      metadata: { name: 'counter' },
      instructions: [{ name: 'increment', accounts: [], args: [] }],
    }))

    const repository = new SvmProgramRepository()
    await repository.loadFrom(tempDir)

    expect(repository.getAll()).toHaveLength(1)
    expect(repository.lookup('counter')).toMatchObject({
      platform: 'svm',
      name: 'counter',
      binaryPath,
      byteLength: 7,
      idlPath,
    })
    expect(repository.lookup('counter')?.uniqueHash).toMatch(/^[0-9a-f]{64}$/)
    expect(repository.lookup('counter.so')?.idl).toMatchObject({ metadata: { name: 'counter' } })
    expect(repository.lookup(path.relative(tempDir, binaryPath))?.binaryPath).toBe(binaryPath)
  })

  it('rejects ambiguous short names while retaining exact-path lookups', async () => {
    const firstDir = path.join(tempDir, 'first')
    const secondDir = path.join(tempDir, 'second')
    await fs.mkdir(firstDir)
    await fs.mkdir(secondDir)
    const firstPath = path.join(firstDir, 'duplicate.so')
    const secondPath = path.join(secondDir, 'duplicate.so')
    await fs.writeFile(firstPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1]))
    await fs.writeFile(secondPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2]))

    const repository = new SvmProgramRepository()
    await repository.loadFrom(tempDir)

    expect(() => repository.lookup('duplicate')).toThrow('Ambiguous SVM program reference')
    expect(repository.lookup(firstPath)?.binaryPath).toBe(firstPath)
    expect(repository.lookup(secondPath)?.binaryPath).toBe(secondPath)
  })
})
