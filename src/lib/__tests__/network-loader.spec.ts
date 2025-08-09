import * as fs from 'fs/promises'
import * as path from 'path'
import { loadNetworks } from '../network-loader'

const tmpDir = path.join(process.cwd(), '.tmp-network-loader-tests')

async function writeNetworksYaml(projectRoot: string, yamlContent: string): Promise<void> {
  await fs.mkdir(projectRoot, { recursive: true })
  await fs.writeFile(path.join(projectRoot, 'networks.yaml'), yamlContent, 'utf-8')
}

describe('network-loader rpcUrl token replacement', () => {
  const originalEnv = { ...process.env }

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  afterAll(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  test('replaces {{RPC_*}} tokens with env values', async () => {
    const projectRoot = path.join(tmpDir, 'case1')
    process.env.RPC_URL_TOKEN = 'abc123'
    const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{RPC_URL_TOKEN}}"
`
    await writeNetworksYaml(projectRoot, yaml)

    const networks = await loadNetworks(projectRoot)
    expect(networks).toHaveLength(1)
    expect(networks[0].rpcUrl).toBe('https://node.example.com/abc123')
  })

  test('leaves non-RPC tokens intact', async () => {
    const projectRoot = path.join(tmpDir, 'case2')
    process.env.SOME_TOKEN = 'should_not_be_used'
    const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{SOME_TOKEN}}"
`
    await writeNetworksYaml(projectRoot, yaml)

    const networks = await loadNetworks(projectRoot)
    expect(networks[0].rpcUrl).toBe('https://node.example.com/{{SOME_TOKEN}}')
  })

  test('supports multiple RPC tokens in a single url', async () => {
    const projectRoot = path.join(tmpDir, 'case3')
    process.env.RPC_A = 'A'
    process.env.RPC_B = 'B'
    const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{RPC_A}}/path/{{RPC_B}}"
`
    await writeNetworksYaml(projectRoot, yaml)

    const networks = await loadNetworks(projectRoot)
    expect(networks[0].rpcUrl).toBe('https://node.example.com/A/path/B')
  })

  test('trims whitespace within tokens', async () => {
    const projectRoot = path.join(tmpDir, 'case4')
    process.env.RPC_TOKEN = 'XYZ'
    const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{  RPC_TOKEN   }}"
`
    await writeNetworksYaml(projectRoot, yaml)

    const networks = await loadNetworks(projectRoot)
    expect(networks[0].rpcUrl).toBe('https://node.example.com/XYZ')
  })

  test('defaults to empty string when RPC token has no matching env var', async () => {
    const projectRoot = path.join(tmpDir, 'case5')
    delete process.env.RPC_MISSING
    const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{RPC_MISSING}}"
`
    await writeNetworksYaml(projectRoot, yaml)

    const networks = await loadNetworks(projectRoot)
    expect(networks[0].rpcUrl).toBe('https://node.example.com/')
  })
})
