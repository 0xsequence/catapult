import { getBytes, Interface, Signature, Wallet } from 'ethers'
import {
  calculateSafeTransactionBuilderChecksum,
  createSafeTransactionArtifact,
  createSafeTransactionBuilderBatch,
  extractSafeTransactionsFromJobOutput,
  proposeSafeTransaction,
  SAFE_TRANSACTION_SCHEMA,
  SAFE_TRANSACTION_PROPOSAL_SCHEMA,
  SafeTransactionBuilderBatch,
} from '../safe'

describe('Safe transaction artifacts', () => {
  const safe = '0x1111111111111111111111111111111111111111'
  const to = '0x2222222222222222222222222222222222222222'

  const artifact = createSafeTransactionArtifact({
    actionName: 'upgrade',
    chainId: 1,
    safe,
    to,
    value: 0,
    data: '0x1234',
    operation: 0,
  })

  it('creates a checksummed, normalized artifact', () => {
    expect(artifact).toEqual({
      schema: SAFE_TRANSACTION_SCHEMA,
      chainId: '1',
      safe,
      to,
      value: '0',
      data: '0x1234',
      operation: 0,
    })
  })

  it('signs and proposes a complete Safe transaction with the next pending nonce', async () => {
    const safeTxHash = `0x${'ab'.repeat(32)}`
    const proposerWallet = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
    const signature = Signature.from(proposerWallet.signingKey.sign(safeTxHash)).serialized
    const safeInterface = new Interface([
      'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)',
    ])
    const provider = {
      call: jest.fn().mockResolvedValue(
        safeInterface.encodeFunctionResult('getTransactionHash', [safeTxHash])
      ),
    }
    const signer = {
      getAddress: jest.fn().mockResolvedValue(proposerWallet.address),
      signDigest: jest.fn().mockResolvedValue(signature),
    }
    const service = {
      getNextNonce: jest.fn().mockResolvedValue('7'),
      estimateSafeTransaction: jest.fn().mockResolvedValue({ safeTxGas: '123' }),
      proposeTransaction: jest.fn().mockResolvedValue(undefined),
    }

    const proposal = await proposeSafeTransaction({
      actionName: 'upgrade',
      artifact,
      provider,
      signer,
      origin: 'Catapult test',
      service,
    })

    expect(service.getNextNonce).toHaveBeenCalledWith(safe)
    expect(service.estimateSafeTransaction).toHaveBeenCalledWith(safe, {
      to,
      value: '0',
      data: '0x1234',
      operation: 0,
    })
    expect(signer.signDigest).toHaveBeenCalledWith(safeTxHash)
    expect(service.proposeTransaction).toHaveBeenCalledWith({
      safeAddress: safe,
      safeTransactionData: {
        to,
        value: '0',
        data: '0x1234',
        operation: 0,
        safeTxGas: '123',
        baseGas: '0',
        gasPrice: '0',
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: 7,
      },
      safeTxHash,
      senderAddress: proposerWallet.address,
      senderSignature: signature,
      origin: 'Catapult test',
    })
    expect(proposal).toEqual({
      schema: SAFE_TRANSACTION_PROPOSAL_SCHEMA,
      chainId: '1',
      safe,
      safeTxHash,
      nonce: '7',
      proposer: proposerWallet.address,
      origin: 'Catapult test',
    })
  })

  it('uses an explicit Safe nonce without querying the Transaction Service', async () => {
    const safeTxHash = `0x${'ab'.repeat(32)}`
    const proposerWallet = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
    const safeInterface = new Interface([
      'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)',
    ])
    const service = {
      getNextNonce: jest.fn(),
      estimateSafeTransaction: jest.fn().mockResolvedValue({ safeTxGas: '123' }),
      proposeTransaction: jest.fn().mockResolvedValue(undefined),
    }

    const proposal = await proposeSafeTransaction({
      actionName: 'upgrade',
      artifact,
      nonce: '12',
      provider: {
        call: jest.fn().mockResolvedValue(
          safeInterface.encodeFunctionResult('getTransactionHash', [safeTxHash])
        ),
      },
      signer: {
        getAddress: jest.fn().mockResolvedValue(proposerWallet.address),
        signDigest: jest.fn().mockResolvedValue(
          Signature.from(proposerWallet.signingKey.sign(safeTxHash)).serialized
        ),
      },
      service,
    })

    expect(service.getNextNonce).not.toHaveBeenCalled()
    expect(proposal.nonce).toBe('12')
  })

  it('converts a personal_sign signature to Safe eth_sign encoding', async () => {
    const safeTxHash = `0x${'ab'.repeat(32)}`
    const proposerWallet = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
    const safeInterface = new Interface([
      'function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 nonce) view returns (bytes32)',
    ])
    const service = {
      getNextNonce: jest.fn().mockResolvedValue('7'),
      estimateSafeTransaction: jest.fn().mockResolvedValue({ safeTxGas: '123' }),
      proposeTransaction: jest.fn().mockResolvedValue(undefined),
    }

    await proposeSafeTransaction({
      actionName: 'upgrade',
      artifact,
      provider: {
        call: jest.fn().mockResolvedValue(
          safeInterface.encodeFunctionResult('getTransactionHash', [safeTxHash])
        ),
      },
      signer: {
        getAddress: jest.fn().mockResolvedValue(proposerWallet.address),
        signDigest: jest.fn().mockResolvedValue(await proposerWallet.signMessage(getBytes(safeTxHash))),
      },
      service,
    })

    const submittedSignature = service.proposeTransaction.mock.calls[0][0].senderSignature
    expect([31, 32]).toContain(Number.parseInt(submittedSignature.slice(-2), 16))
  })

  it('creates an importable Safe Transaction Builder batch', () => {
    const batch = createSafeTransactionBuilderBatch([artifact], {
      name: 'Upgrade',
      description: 'Upgrade the proxy',
      createdAt: 123,
    })

    expect(batch).toMatchObject({
      version: '1.0',
      chainId: '1',
      createdAt: 123,
      meta: {
        name: 'Upgrade',
        description: 'Upgrade the proxy',
        createdFromSafeAddress: safe,
        createdFromOwnerAddress: '',
      },
      transactions: [{ to, value: '0', data: '0x1234' }],
    })
    expect(batch.meta.checksum).toBe(calculateSafeTransactionBuilderChecksum(batch))
  })

  it('matches Safe Transaction Builder checksum behavior', () => {
    // Fixture and checksum from Safe Transaction Builder v1.4.0's official test suite.
    const officialFixture = {
      version: '1.0',
      chainId: '4',
      createdAt: 1646321521061,
      meta: {
        name: 'test batch file',
        txBuilderVersion: '1.4.0',
        checksum: '',
        createdFromSafeAddress: '0xDF8a1Ce35c9a6ACE153B4e0767942f1E2291a1Aa',
        createdFromOwnerAddress: '0x49d4450977E2c95362C13D3a31a09311E0Ea26A6',
      },
      transactions: [
        {
          to: '0x49d4450977E2c95362C13D3a31a09311E0Ea26A6',
          value: '0',
          contractMethod: {
            inputs: [{ internalType: 'address', name: 'paramAddress', type: 'address' }],
            name: 'testAddress',
            payable: false,
          },
          contractInputsValues: { paramAddress: '0x49d4450977E2c95362C13D3a31a09311E0Ea26A6' },
        },
        {
          to: '0x49d4450977E2c95362C13D3a31a09311E0Ea26A6',
          value: '0',
          contractMethod: {
            inputs: [{ internalType: 'bool', name: 'paramBool', type: 'bool' }],
            name: 'testBool',
            payable: false,
          },
          contractInputsValues: { paramAddress: '', paramBool: 'false' },
        },
        {
          to: '0x49d4450977E2c95362C13D3a31a09311E0Ea26A6',
          value: '2000000000000000000',
          data: '0x42f4579000000000000000000000000049d4450977e2c95362c13d3a31a09311e0ea26a6',
        },
      ],
    } as SafeTransactionBuilderBatch

    expect(calculateSafeTransactionBuilderChecksum(officialFixture))
      .toBe('0x86c81826dbf7e8a37612153294cc85fdf5c81998dd0a44b86d945502a7eace7c')
  })

  it('extracts artifacts with stable job/action selectors', () => {
    const extracted = extractSafeTransactionsFromJobOutput({
      jobName: 'upgrade-job',
      networks: [{
        status: 'success',
        chainIds: ['1'],
        outputs: { 'upgrade.safeTransaction': artifact },
      }],
    }, '1')

    expect(extracted).toEqual([{ selector: 'upgrade-job/upgrade', artifact }])
  })

  it('extracts only the requested network', () => {
    const polygonArtifact = { ...artifact, chainId: '137' }
    const extracted = extractSafeTransactionsFromJobOutput({
      jobName: 'multi-network-job',
      networks: [
        { status: 'success', chainIds: ['1'], outputs: { 'tx.safeTransaction': artifact } },
        { status: 'success', chainIds: ['137'], outputs: { 'tx.safeTransaction': polygonArtifact } },
      ],
    }, '137')

    expect(extracted).toEqual([{ selector: 'multi-network-job/tx', artifact: polygonArtifact }])
  })

  it('rejects unsafe Transaction Builder batches', () => {
    expect(() => createSafeTransactionBuilderBatch([
      artifact,
      { ...artifact, safe: '0x3333333333333333333333333333333333333333' },
    ])).toThrow('same Safe')

    expect(() => createSafeTransactionBuilderBatch([
      { ...artifact, operation: 1 },
    ])).toThrow('CALL')
  })

  it('rejects artifacts whose embedded chain ID disagrees with the job output', () => {
    expect(() => extractSafeTransactionsFromJobOutput({
      jobName: 'bad-job',
      networks: [{
        status: 'success',
        chainIds: ['137'],
        outputs: { 'tx.safeTransaction': artifact },
      }],
    })).toThrow('chain ID is not present')
  })

  it('rejects malformed versioned artifacts instead of exporting them', () => {
    expect(() => extractSafeTransactionsFromJobOutput({
      jobName: 'bad-job',
      networks: [{
        status: 'success',
        chainIds: ['1'],
        outputs: {
          'tx.safeTransaction': { ...artifact, safe: 'not-an-address' },
        },
      }],
    })).toThrow('safe is not a valid EVM address')
  })
})
