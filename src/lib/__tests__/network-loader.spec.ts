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

describe('network-loader params', () => {
  afterAll(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  test('passes through valid params object', async () => {
    const projectRoot = path.join(tmpDir, 'params-valid')
    const yaml = `
- name: "MyNet"
  chainId: 4217
  rpcUrl: "http://127.0.0.1:8545"
  params:
    myParam: true
`
    await writeNetworksYaml(projectRoot, yaml)

    const networks = await loadNetworks(projectRoot)
    expect(networks).toHaveLength(1)
    expect(networks[0].params).toEqual({ myParam: true })
  })

  test('rejects params when not a plain object', async () => {
    const projectRoot = path.join(tmpDir, 'params-invalid-array')
    const yaml = `
- name: "BadNet"
  chainId: 1
  rpcUrl: "http://127.0.0.1:8545"
  params: [1, 2, 3]
`
    await writeNetworksYaml(projectRoot, yaml)

    await expect(loadNetworks(projectRoot)).rejects.toThrow(/Failed to load or parse networks.yaml/)
  })

  test('rejects params when null', async () => {
    const projectRoot = path.join(tmpDir, 'params-invalid-null')
    const yaml = `
- name: "BadNet"
  chainId: 1
  rpcUrl: "http://127.0.0.1:8545"
  params: null
`
    await writeNetworksYaml(projectRoot, yaml)

    await expect(loadNetworks(projectRoot)).rejects.toThrow(/Failed to load or parse networks.yaml/)
  })
})

describe('network-loader platform', () => {
  test('accepts evm, tron, and reserved svm platforms', async () => {
    const projectRoot = path.join(tmpDir, 'platform-valid')
    const yaml = `
- name: "Ethereum"
  chainId: 1
  rpcUrl: "https://eth.example"
  platform: "evm"
- name: "Tron"
  chainId: 3448148188
  rpcUrl: "https://nile.trongrid.io"
  platform: "tron"
- name: "Future SVM"
  chainId: 900000
  rpcUrl: "http://127.0.0.1:8899"
  platform: "svm"
`
    await writeNetworksYaml(projectRoot, yaml)

    const networks = await loadNetworks(projectRoot)
    expect(networks.map(n => n.platform)).toEqual(['evm', 'tron', 'svm'])
  })

  test('rejects unknown platforms', async () => {
    const projectRoot = path.join(tmpDir, 'platform-invalid')
    const yaml = `
- name: "Bad"
  chainId: 1
  rpcUrl: "https://bad.example"
  platform: "cosmos"
`
    await writeNetworksYaml(projectRoot, yaml)

    await expect(loadNetworks(projectRoot)).rejects.toThrow(/Failed to load or parse networks.yaml/)
  })
})
