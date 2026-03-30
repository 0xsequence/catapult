import { ethers } from 'ethers'

export interface DigestSigner extends ethers.Signer {
  signDigest(digest: Uint8Array | string): Promise<string>
}

export function isDigestSigner(signer: ethers.Signer): signer is DigestSigner {
  return typeof (signer as any).signDigest === 'function'
}

type LegacyJsonRpcSigner = ethers.JsonRpcSigner & {
  _legacySignMessage?: (message: Uint8Array | string) => Promise<string>
}

export function toDigestSigner(signer: ethers.Signer): DigestSigner {
  if (isDigestSigner(signer)) {
    return signer
  }

  const maybeLegacy = signer as LegacyJsonRpcSigner
  if (typeof maybeLegacy._legacySignMessage === 'function') {
    const digestSigner = signer as DigestSigner & LegacyJsonRpcSigner
    digestSigner.signDigest = async (digest: Uint8Array | string) => {
      const bytes = typeof digest === 'string' ? ethers.getBytes(digest) : digest
      return maybeLegacy._legacySignMessage!(bytes)
    }
    return digestSigner
  }

  if ((signer as any).signingKey || (signer as any).privateKey) {
    const digestSigner = signer as DigestSigner
    digestSigner.signDigest = async (digest: Uint8Array | string) => {
      const bytes = typeof digest === 'string' ? ethers.getBytes(digest) : digest
      const signingKey = (signer as any).signingKey
      if (signingKey && typeof signingKey.sign === 'function') {
        return ethers.Signature.from(signingKey.sign(bytes)).serialized
      }
      const privateKey = (signer as any).privateKey
      if (typeof privateKey === 'string' && privateKey.length > 0) {
        return ethers.Signature.from(new ethers.SigningKey(privateKey).sign(bytes)).serialized
      }
      throw new Error(`Signer does not expose a private key or signing key. Provide a local signer.`)
    }
    return digestSigner
  }

  throw new Error(`Signer does not expose a private key. Provide a local signer.`)
}
