import { Network } from '../types/network'
import { VerificationPlatform, VerificationRequest, VerificationResult, getFullCompilerVersion } from './etherscan'

const SOURCIFY_API_BASE = 'https://sourcify.dev/server'

type SourcifyMatch = 'match' | 'exact_match' | null

interface SourcifyContractResponse {
  match: SourcifyMatch
}

interface SourcifyVerifyJobResponse {
  isJobCompleted: boolean
  contract?: {
    match: SourcifyMatch
  }
  error?: {
    message: string
    customCode?: string
  }
}

export class SourcifyVerificationPlatform implements VerificationPlatform {
  readonly name = 'sourcify'

  supportsNetwork(network: Network): boolean {
    // Only support networks that explicitly include this platform in their supports list
    return Array.isArray(network.supports) && network.supports.includes(this.name)
  }

  isConfigured(): boolean {
    // Sourcify requires no configuration
    return true
  }

  getConfigurationRequirements(): string {
    return 'Sourcify requires no configuration'
  }

  async isContractAlreadyVerified(address: string, network: Network): Promise<boolean> {
    try {
      const response = await fetch(
        `${SOURCIFY_API_BASE}/v2/contract/${network.chainId}/${address}?fields=match`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(15000), // 15 second timeout
        }
      )

      // A 404 means the contract has no verified match on Sourcify
      if (response.status === 404 || !response.ok) {
        return false
      }

      const data = await response.json() as SourcifyContractResponse
      return data.match === 'match' || data.match === 'exact_match'
    } catch (error) {
      // If we can't determine the verification status, assume it's not verified
      console.warn(`Failed to check Sourcify verification status for ${address}: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  async verifyContract(request: VerificationRequest): Promise<VerificationResult> {
    const { contract, buildInfo, address, network } = request

    // First check if it's already verified
    const alreadyVerified = await this.isContractAlreadyVerified(address, network)
    if (alreadyVerified) {
      return {
        success: true,
        message: 'Contract was already verified on Sourcify (checked before attempting verification)',
        isAlreadyVerified: true
      }
    }

    if (!contract.sourceName || !contract.contractName) {
      return {
        success: false,
        message: 'Sourcify verification failed: contract is missing sourceName/contractName'
      }
    }

    try {
      const compilerVersion = getFullCompilerVersion(buildInfo)
      const contractIdentifier = `${contract.sourceName}:${contract.contractName}`

      const response = await fetch(`${SOURCIFY_API_BASE}/v2/verify/${network.chainId}/${address}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stdJsonInput: {
            language: buildInfo.input.language,
            sources: buildInfo.input.sources,
            settings: buildInfo.input.settings
          },
          compilerVersion,
          contractIdentifier
        }),
        signal: AbortSignal.timeout(60000), // 60 second timeout for submission
      })

      if (!response.ok) {
        let responseText = ''
        try {
          responseText = await response.text()
        } catch {
          // ignore
        }

        // Treat "already verified" conflicts as a non-error notice
        if (response.status === 409) {
          const lower = `${response.statusText} ${responseText}`.toLowerCase()
          if (lower.includes('already') || lower.includes('partial')) {
            return {
              success: true,
              message: 'Contract already verified on Sourcify (no further action needed)',
              isAlreadyVerified: true
            }
          }
        }

        let errorDetails = `HTTP ${response.status}: ${response.statusText}`
        if (responseText) {
          errorDetails += ` - ${responseText}`
        }
        return {
          success: false,
          message: `Sourcify API request failed: ${errorDetails}`
        }
      }

      const { verificationId } = await response.json() as { verificationId: string }
      return await this.waitForVerificationJob(verificationId)
    } catch (error) {
      return {
        success: false,
        message: `Sourcify verification failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  // Sourcify v2 verification is asynchronous - it hands back a job id that must be polled
  private async waitForVerificationJob(
    verificationId: string,
    timeoutMs = 120000,
    pollIntervalMs = 2500
  ): Promise<VerificationResult> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const response = await fetch(`${SOURCIFY_API_BASE}/v2/verify/${verificationId}`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) {
        return {
          success: false,
          message: `Sourcify job status check failed: HTTP ${response.status}: ${response.statusText}`
        }
      }

      const job = await response.json() as SourcifyVerifyJobResponse

      if (job.isJobCompleted) {
        const match = job.contract?.match
        if (match === 'match' || match === 'exact_match') {
          return {
            success: true,
            message: `Contract verified successfully on Sourcify (${match})`
          }
        }

        // Sourcify reports this when the contract already has an exact match on record and
        // the newly submitted sources didn't improve on it - treat as already-verified, not a failure
        if (job.error?.customCode === 'already_verified' || job.error?.message?.toLowerCase().includes('already verified')) {
          return {
            success: true,
            message: job.error.message,
            isAlreadyVerified: true
          }
        }

        return {
          success: false,
          message: job.error?.message || 'Sourcify verification failed - no match found'
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }

    return {
      success: false,
      message: `Sourcify verification timed out after ${timeoutMs / 1000} seconds waiting for job ${verificationId}`
    }
  }
}
