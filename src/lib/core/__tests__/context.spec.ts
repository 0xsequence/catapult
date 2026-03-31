import { ethers } from 'ethers'
import { ExecutionContext } from '../context'
import { Network } from '../../types'

describe('ExecutionContext', () => {
  const network: Network = {
    name: 'test',
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545'
  }

  const contractRepository = {} as any

  it('wraps private-key signers in a NonceManager', async () => {
    const context = new ExecutionContext(
      network,
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      contractRepository
    )

    const signer = await context.getResolvedSigner()
    expect(signer).toBeInstanceOf(ethers.NonceManager)
  })

  it('wraps promised signers in a NonceManager when first resolved', async () => {
    const getSignerSpy = jest.spyOn(ethers.JsonRpcProvider.prototype, 'getSigner')
    getSignerSpy.mockResolvedValue(
      ethers.Wallet.createRandom().connect(new ethers.JsonRpcProvider(network.rpcUrl)) as any
    )

    const context = new ExecutionContext(network, undefined, contractRepository)

    await expect(context.getResolvedSigner()).resolves.toBeInstanceOf(ethers.NonceManager)

    getSignerSpy.mockRestore()
  })
})
