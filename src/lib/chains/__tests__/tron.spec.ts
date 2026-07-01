import { TronAdapter } from '../tron'
import { Network } from '../../types'

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

function makeNetwork(): Network {
  return {
    name: 'Tron Nile',
    chainId: 3448148188,
    rpcUrl: 'https://nile.trongrid.io',
    platform: 'tron',
  }
}

describe('TronAdapter', () => {
  it('normalizes Base58 and 41-prefixed addresses to Catapult canonical 0x addresses', () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)

    expect(adapter.normalizeAddress('TYBNgWfhGuNzdLtjKtxXTfskAhTbMcqbaG')).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(adapter.normalizeAddress('41f39fd6e51aad88f6f4ce6ab8827279cfffb92266')).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
    expect(adapter.normalizeAddress('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266')).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  })

  it('derives the canonical signer address from a Tron private key', async () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)

    await expect(adapter.getSignerAddress()).resolves.toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  })

  it('rejects implicit signing', async () => {
    const adapter = new TronAdapter(makeNetwork())

    await expect(adapter.getSignerAddress()).rejects.toThrow('implicit RPC signers are not supported')
  })

  it('does not accept Ethereum raw signed transactions', async () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)

    await expect(adapter.broadcastSignedTransaction('0x1234')).rejects.toThrow('not implemented for Tron')
  })

  it('returns empty bytecode when Tron reports a contract lookup miss', async () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)
    ;(adapter as any).tronWeb.trx.getContract = jest.fn().mockRejectedValue(new Error('contract does not exist'))

    await expect(adapter.getCode('0x0000000000000000000000000000000000000001')).resolves.toBe('0x')
  })

  it('rethrows non-lookup contract errors without falling back to account lookups', async () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)
    const getAccount = jest.fn()
    ;(adapter as any).tronWeb.trx.getContract = jest.fn().mockRejectedValue(new Error('node unavailable'))
    ;(adapter as any).tronWeb.trx.getAccount = getAccount

    await expect(adapter.getCode('0x0000000000000000000000000000000000000001')).rejects.toThrow('node unavailable')
    expect(getAccount).not.toHaveBeenCalled()
  })

  it('runs constant calls without a private key', async () => {
    const adapter = new TronAdapter(makeNetwork())
    const triggerConstantContract = jest
      .fn()
      .mockResolvedValue({ result: { result: true }, constant_result: ['000000000000000000000000000000000000000000000000000000000000002a'] })
    ;(adapter as any).tronWeb.transactionBuilder.triggerConstantContract = triggerConstantContract

    const result = await adapter.call({
      to: '0x0000000000000000000000000000000000000001',
      data: '0x70a08231',
    })

    expect(result).toBe('0x000000000000000000000000000000000000000000000000000000000000002a')
    expect(triggerConstantContract).toHaveBeenCalledWith(
      '410000000000000000000000000000000000000001',
      '',
      { input: '70a08231', feeLimit: 150_000_000 },
      [],
      '410000000000000000000000000000000000000000'
    )
  })

  it('estimates smart contract execution as a Tron fee limit in sun', async () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)
    const estimateEnergy = jest.fn().mockResolvedValue({
      result: { result: true },
      energy_required: 10_000,
    })
    ;(adapter as any).tronWeb.transactionBuilder.estimateEnergy = estimateEnergy
    ;(adapter as any).tronWeb.trx.getChainParameters = jest.fn().mockResolvedValue([
      { key: 'getEnergyFee', value: 420 },
    ])

    const estimate = await adapter.estimateGas({
      to: '0x0000000000000000000000000000000000000001',
      data: '0x70a08231',
    })

    expect(estimate).toBe(4_200_000n)
    expect(estimateEnergy).toHaveBeenCalledWith(
      '410000000000000000000000000000000000000001',
      '',
      { input: '70a08231', feeLimit: 150_000_000 },
      [],
      expect.any(String)
    )
  })

  it('uses a positive fee limit estimate for native transfers', async () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)

    await expect(adapter.estimateGas({
      to: '0x0000000000000000000000000000000000000001',
      value: 1,
      data: '0x',
    })).resolves.toBe(150_000_000n)
  })

  it('uses gasLimit as the Tron fee limit for smart contract transactions', async () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)
    const triggerSmartContract = jest.fn().mockResolvedValue({
      result: { result: true },
      transaction: { txID: '0xabc' },
    })
    ;(adapter as any).tronWeb.transactionBuilder.triggerSmartContract = triggerSmartContract
    ;(adapter as any).tronWeb.trx.sign = jest.fn().mockResolvedValue({ txID: '0xabc' })
    ;(adapter as any).tronWeb.trx.sendRawTransaction = jest.fn().mockResolvedValue({ result: true, txid: '0xabc' })

    await adapter.sendTransaction({
      to: '0x0000000000000000000000000000000000000001',
      data: '0x70a08231',
      gasLimit: 12_345,
    })

    expect(triggerSmartContract).toHaveBeenCalledWith(
      '410000000000000000000000000000000000000001',
      '',
      { input: '70a08231', feeLimit: 12_345, callValue: 0 },
      [],
      expect.any(String)
    )
  })

  it('marks value-bearing contract creation as payable when no ABI is provided', async () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)
    const createSmartContract = jest.fn().mockResolvedValue({ txID: '0xdef' })
    ;(adapter as any).tronWeb.transactionBuilder.createSmartContract = createSmartContract
    ;(adapter as any).tronWeb.trx.sign = jest.fn().mockResolvedValue({ txID: '0xdef' })
    ;(adapter as any).tronWeb.trx.sendRawTransaction = jest.fn().mockResolvedValue({ result: true, txid: '0xdef' })

    await adapter.createContract({
      data: '0x6000',
      value: 1,
      gasLimit: 99_999,
    })

    expect(createSmartContract).toHaveBeenCalledWith(
      expect.objectContaining({
        abi: [{ type: 'constructor', stateMutability: 'payable', inputs: [] }],
        feeLimit: 99_999,
        callValue: 1,
      }),
      expect.any(String)
    )
  })

  it('formats sun without losing precision', () => {
    const adapter = new TronAdapter(makeNetwork(), PRIVATE_KEY)

    expect(adapter.formatNativeValue(123_456_789_123_456_789n)).toBe('123456789123.456789')
  })

  it('waits until transaction info has a receipt result or block number', async () => {
    const adapter = new TronAdapter({
      ...makeNetwork(),
      params: { receiptPollMs: 0 },
    }, PRIVATE_KEY)
    const getUnconfirmedTransactionInfo = jest
      .fn()
      .mockResolvedValueOnce({ id: '0xabc' })
      .mockResolvedValueOnce({
        id: '0xabc',
        blockNumber: 123,
        receipt: { result: 'SUCCESS' },
        contract_address: '410000000000000000000000000000000000000001',
      })
    ;(adapter as any).tronWeb.trx.getUnconfirmedTransactionInfo = getUnconfirmedTransactionInfo

    const receipt = await (adapter as any).waitForReceipt('0xabc', {})

    expect(getUnconfirmedTransactionInfo).toHaveBeenCalledTimes(2)
    expect(receipt).toEqual(expect.objectContaining({
      status: 1,
      blockNumber: 123,
      contractAddress: '0x0000000000000000000000000000000000000001',
    }))
  })
})
