import { ethers } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'
import { ExecutionEngine } from '../engine'
import { ExecutionContext } from '../context'
import { parseTemplate } from '../../parsers'
import { ContractRepository } from '../../contracts/repository'
import { VerificationPlatformRegistry } from '../../verification/etherscan'
import { Job, Network, Template } from '../../types'

// First anvil account (also funded on the local Polygon-fork node used in CI).
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
// A plain EOA stands in for the Safe: it accepts any calldata, so we can prove
// the template assembles + broadcasts execTransaction without a real Safe.
const SAFE_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const INNER_TARGET = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

const EXEC_TRANSACTION_SIG =
  'execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)'

describe('safe-exec-transaction std template', () => {
  let engine: ExecutionEngine
  let context: ExecutionContext
  let mockNetwork: Network
  let mockRegistry: ContractRepository
  let templates: Map<string, Template>
  let anvilProvider: ethers.JsonRpcProvider
  let template: Template

  beforeAll(async () => {
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545'
    mockNetwork = { name: 'testnet', chainId: 999, rpcUrl }
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    await provider.getNetwork()

    // Parse the ACTUAL shipped template so the test exercises what we ship.
    const templatePath = path.resolve(__dirname, '..', '..', 'std', 'templates', 'safe-exec-transaction.yaml')
    template = parseTemplate(fs.readFileSync(templatePath, 'utf8'))
  })

  beforeEach(async () => {
    const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545'
    anvilProvider = new ethers.JsonRpcProvider(rpcUrl)

    mockRegistry = new ContractRepository()
    context = new ExecutionContext(mockNetwork, TEST_PRIVATE_KEY, mockRegistry)

    templates = new Map()
    templates.set('safe-exec-transaction', template)

    const verificationRegistry = new VerificationPlatformRegistry()
    engine = new ExecutionEngine(templates, { verificationRegistry })
  })

  afterEach(async () => {
    if (anvilProvider) {
      try {
        if (anvilProvider.destroy) await anvilProvider.destroy()
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    if (context) {
      try {
        await context.dispose()
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  })

  it('parses as a valid template with the expected argument surface', () => {
    expect(template.name).toBe('safe-exec-transaction')
    expect(Object.keys(template.arguments || {})).toEqual(
      expect.arrayContaining(['safe', 'to', 'data', 'operation', 'signatures']),
    )
    expect(template.returns?.hash).toBeDefined()
  })

  it('assembles execTransaction from the inner call + packed signatures and broadcasts it', async () => {
    const innerData = '0xabcdef'
    // A synthetic packed signature blob (1 owner: r || s || v). Contents are
    // opaque to the template; we only assert they are forwarded verbatim.
    const signatures =
      '0x' +
      '11'.repeat(32) + // r
      '22'.repeat(32) + // s
      '1b' // v

    const job: Job = {
      name: 'relay-safe-tx',
      version: '1.0.0',
      actions: [
        {
          name: 'exec',
          template: 'safe-exec-transaction',
          arguments: {
            safe: SAFE_ADDRESS,
            to: INNER_TARGET,
            data: innerData,
            value: '0',
            operation: '0',
            safeTxGas: '0',
            baseGas: '0',
            gasPrice: '0',
            gasToken: ethers.ZeroAddress,
            refundReceiver: ethers.ZeroAddress,
            signatures,
          },
        },
      ],
    }

    await expect(engine.executeJob(job, context)).resolves.not.toThrow()

    const hash = context.getOutput('exec.hash')
    expect(hash).toBeDefined()

    // The broadcast transaction must go to the Safe and carry the exact
    // execTransaction calldata we expect.
    const iface = new ethers.Interface([`function ${EXEC_TRANSACTION_SIG}`])
    const expectedData = iface.encodeFunctionData('execTransaction', [
      INNER_TARGET,
      0n,
      innerData,
      0,
      0n,
      0n,
      0n,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      signatures,
    ])

    const tx = await anvilProvider.getTransaction(hash)
    expect(tx).not.toBeNull()
    expect(ethers.getAddress(tx!.to as string)).toBe(ethers.getAddress(SAFE_ADDRESS))
    expect(tx!.data.toLowerCase()).toBe(expectedData.toLowerCase())
  })
})
