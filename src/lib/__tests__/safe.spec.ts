import {
  calculateSafeTransactionBuilderChecksum,
  createSafeTransactionArtifact,
  createSafeTransactionBuilderBatch,
  extractSafeTransactionsFromJobOutput,
  SAFE_TRANSACTION_SCHEMA,
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
