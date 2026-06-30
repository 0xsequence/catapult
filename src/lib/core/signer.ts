import { ethers } from 'ethers'

export interface DigestSigner extends ethers.Signer {
  signDigest(digest: Uint8Array | string): Promise<string>
}

export function isDigestSigner(signer: ethers.Signer): signer is DigestSigner {
  return typeof (signer as any).signDigest === 'function'
}

type LegacySignMessage = (message: Uint8Array | string) => Promise<string>

/**
 * Walk a signer and any wrapped inner signer (e.g. `NonceManager.signer`) applying
 * `pick` until it returns a value. This lets us reach the underlying key/legacy
 * method even when the signer has been wrapped (for nonce management, etc.).
 */
function unwrap<T>(signer: ethers.Signer, pick: (s: any) => T | undefined): T | undefined {
  let current: any = signer
  const seen = new Set<any>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const found = pick(current)
    if (found !== undefined) {
      return found
    }
    current = current.signer
  }
  return undefined
}

function findSigningKey(signer: ethers.Signer): ethers.SigningKey | undefined {
  return unwrap(signer, (s) => {
    if (s.signingKey && typeof s.signingKey.sign === 'function') {
      return s.signingKey as ethers.SigningKey
    }
    if (typeof s.privateKey === 'string' && s.privateKey.length > 0) {
      return new ethers.SigningKey(s.privateKey)
    }
    return undefined
  })
}

function findLegacySignMessage(signer: ethers.Signer): LegacySignMessage | undefined {
  return unwrap(signer, (s) =>
    typeof s._legacySignMessage === 'function' ? (s._legacySignMessage.bind(s) as LegacySignMessage) : undefined
  )
}

export function toDigestSigner(signer: ethers.Signer): DigestSigner {
  if (isDigestSigner(signer)) {
    return signer
  }

  const signingKey = findSigningKey(signer)
  if (signingKey) {
    const digestSigner = signer as DigestSigner
    digestSigner.signDigest = async (digest: Uint8Array | string) => {
      const bytes = typeof digest === 'string' ? ethers.getBytes(digest) : digest
      return ethers.Signature.from(signingKey.sign(bytes)).serialized
    }
    return digestSigner
  }

  const legacySignMessage = findLegacySignMessage(signer)
  if (legacySignMessage) {
    const digestSigner = signer as DigestSigner
    digestSigner.signDigest = async (digest: Uint8Array | string) => {
      const bytes = typeof digest === 'string' ? ethers.getBytes(digest) : digest
      return legacySignMessage(bytes)
    }
    return digestSigner
  }

  throw new Error(`Signer does not expose a private key. Provide a local signer.`)
}
