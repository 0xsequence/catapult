import { ethers } from 'ethers'
import { toDigestSigner } from '../signer'

describe('toDigestSigner', () => {
  it('returns the same signer if it already supports signDigest', async () => {
    const wallet = ethers.Wallet.createRandom()
    const digestSigner = wallet as typeof wallet & { signDigest: jest.Mock }
    digestSigner.signDigest = jest.fn().mockResolvedValue('0xdeadbeef')

    const digest = ethers.keccak256(ethers.toUtf8Bytes('existing-digest-signer'))
    const result = toDigestSigner(digestSigner)
    const signature = await result.signDigest(digest)

    expect(result).toBe(digestSigner)
    expect(signature).toBe('0xdeadbeef')
    expect(digestSigner.signDigest).toHaveBeenCalledWith(digest)
  })

  it('adds signDigest support for wallets using the raw digest', async () => {
    const wallet = ethers.Wallet.createRandom()
    const digest = ethers.keccak256(ethers.toUtf8Bytes('wallet-digest'))

    const digestSigner = toDigestSigner(wallet)
    const signature = await digestSigner.signDigest(digest)

    const expectedSignature = ethers.Signature.from(
      wallet.signingKey.sign(ethers.getBytes(digest))
    ).serialized
    expect(signature).toBe(expectedSignature)
  })

  it('wraps JsonRpcSigner by delegating to legacy sign message', async () => {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545')
    const signer = await provider.getSigner()
    const legacySign = jest.fn(async () => '0xlegacy')
    ;(signer as any)._legacySignMessage = legacySign

    const digest = ethers.keccak256(ethers.toUtf8Bytes('jsonrpc-digest'))
    const digestSigner = toDigestSigner(signer)
    const signature = await digestSigner.signDigest(digest)

    expect(signature).toBe('0xlegacy')
    expect(legacySign).toHaveBeenCalledWith(ethers.getBytes(digest))

    if ((provider as any).destroy) {
      await provider.destroy()
    }
  })
})

