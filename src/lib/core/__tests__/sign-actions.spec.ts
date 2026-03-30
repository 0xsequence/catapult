import { ExecutionEngine } from '../engine'
import { ExecutionContext } from '../context'
import { ContractRepository } from '../../contracts/repository'
import { Job, Network } from '../../types'
import { ethers } from 'ethers'

const TEST_WALLET = ethers.Wallet.createRandom()
const PRIVATE_KEY = TEST_WALLET.privateKey

const networkConfig: Network = {
  name: 'Testnet',
  chainId: 1337,
  rpcUrl: 'http://127.0.0.1:8545'
}

describe('sign primitives', () => {
  let engine: ExecutionEngine
  let context: ExecutionContext

  beforeEach(async () => {
    engine = new ExecutionEngine(new Map())
    context = new ExecutionContext(networkConfig, PRIVATE_KEY, new ContractRepository())
  })

  afterEach(async () => {
    await context.dispose()
  })

  it('signs a raw digest', async () => {
    const digest = ethers.keccak256(ethers.toUtf8Bytes('catapult-sign-digest'))

    const job: Job = {
      name: 'sign-digest',
      version: '1',
      actions: [
        {
          name: 'digest',
          type: 'sign-digest',
          arguments: {
            digest
          }
        }
      ]
    }

    await engine.executeJob(job, context)

    const expectedSignature = ethers.Signature.from(TEST_WALLET.signingKey.sign(ethers.getBytes(digest))).serialized

    expect(context.getOutput('digest.signature')).toBe(expectedSignature)
    expect(context.getOutput('digest.digest')).toBe(ethers.hexlify(digest))
  })

  it('signs typed data payloads', async () => {
    const domain = {
      name: 'Test Mail',
      version: '1',
      chainId: 1337,
      verifyingContract: '0x0000000000000000000000000000000000000001'
    }

    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' }
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' }
      ]
    }

    const message = {
      from: {
        name: 'Alice',
        wallet: TEST_WALLET.address
      },
      to: {
        name: 'Bob',
        wallet: '0x0000000000000000000000000000000000000002'
      },
      contents: 'Hello from Catapult!'
    }

    const job: Job = {
      name: 'sign-typed-data',
      version: '1',
      actions: [
        {
          name: 'typed',
          type: 'sign-typed-data',
          arguments: {
            domain,
            types,
            message,
            primaryType: 'Mail'
          }
        }
      ]
    }

    await engine.executeJob(job, context)

    const normalizedTypes = {
      Mail: types.Mail,
      Person: types.Person
    }
    const expectedSignature = await TEST_WALLET.signTypedData(domain, normalizedTypes, message)

    expect(context.getOutput('typed.signature')).toBe(expectedSignature)
    expect(context.getOutput('typed.domain')).toEqual(domain)
    expect(context.getOutput('typed.types')).toEqual(types)
    expect(context.getOutput('typed.message')).toEqual(message)
    expect(context.getOutput('typed.primaryType')).toBe('Mail')
  })

  it('signs arbitrary messages via EIP-191', async () => {
    const message = 'Hello from Catapult!'

    const job: Job = {
      name: 'sign-message',
      version: '1',
      actions: [
        {
          name: 'msg',
          type: 'sign-message',
          arguments: {
            message
          }
        }
      ]
    }

    await engine.executeJob(job, context)

    const expectedSignature = await TEST_WALLET.signMessage(message)
    expect(context.getOutput('msg.signature')).toBe(expectedSignature)
    expect(context.getOutput('msg.message')).toBe(message)
  })
})

