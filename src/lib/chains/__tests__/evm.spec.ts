import { EvmAdapter } from '../evm'
import { Network } from '../../types'
import { ethers } from 'ethers'

const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

function makeNetwork(): Network {
  return {
    name: 'Local',
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
  }
}

describe('EvmAdapter', () => {
  const adapters: EvmAdapter[] = []

  afterEach(async () => {
    await Promise.all(adapters.splice(0).map(adapter => adapter.dispose()))
  })

  it('accepts any-case hex addresses and normalizes them', () => {
    const adapter = new EvmAdapter(makeNetwork(), PRIVATE_KEY)
    adapters.push(adapter)

    expect(adapter.normalizeAddress('0xf39fd6E51aad88F6F4ce6aB8827279cffFb92266')).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
  })

  it('treats a zero gas price as a valid cost estimate', async () => {
    const adapter = new EvmAdapter(makeNetwork(), PRIVATE_KEY)
    adapters.push(adapter)
    jest.spyOn(adapter.provider, 'getFeeData').mockResolvedValue(new ethers.FeeData(0n, null, null))
    jest.spyOn(adapter, 'estimateGas').mockResolvedValue(21_000n)
    jest.spyOn(adapter, 'getSignerBalance').mockResolvedValue(1n)

    const estimate = await adapter.estimateTransactionCost({
      to: '0x0000000000000000000000000000000000000001',
      data: '0x',
      value: 0,
    })

    expect(estimate).not.toBeNull()
    expect(estimate?.gasPrice).toBe(0n)
    expect(estimate?.requiredBalance).toBe(0n)
  })

  it('honors an explicit zero gas limit instead of re-estimating', async () => {
    const adapter = new EvmAdapter(makeNetwork(), PRIVATE_KEY)
    adapters.push(adapter)
    jest.spyOn(adapter.provider, 'getFeeData').mockResolvedValue(new ethers.FeeData(1n, null, null))
    const estimateGas = jest.spyOn(adapter, 'estimateGas').mockResolvedValue(21_000n)
    jest.spyOn(adapter, 'getSignerBalance').mockResolvedValue(1n)

    const estimate = await adapter.estimateTransactionCost({
      to: '0x0000000000000000000000000000000000000001',
      data: '0x',
      value: 0,
      gasLimit: 0,
    })

    expect(estimate?.gasLimit).toBe(0n)
    expect(estimateGas).not.toHaveBeenCalled()
  })
})
