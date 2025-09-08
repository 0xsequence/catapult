import { ethers } from "ethers";

export function isAddress(value: unknown): value is string {
  return ethers.isAddress(value)
}

export function isBytesLike(value: unknown): value is string {
  return ethers.isBytesLike(value)
}

export function isBigNumberish(value: unknown): value is string | number | bigint {
  try {
    switch (typeof(value)) {
      case "bigint":
      case "number":
      case "string":
        ethers.toBigInt(value)
        return true
    }
  } catch (error) {
    // Fail out
  }
  return false
}
