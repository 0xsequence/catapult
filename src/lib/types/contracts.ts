import { CompilerInfo } from './artifacts'
import { SourceProvenance } from './source'

export interface Contract {
  // The ultimate, unambiguous identifier
  uniqueHash: string

  // Core Information - Only creationCode is truly required
  creationCode: string
  runtimeBytecode?: string
  abi?: any[]

  // Source Information
  sourceName?: string // e.g., "contracts/MyToken.sol"
  contractName?: string
  source?: string // The full source code

  // Compilation Information
  compiler?: CompilerInfo
  buildInfoId?: string // The ID from the build-info file it was found in
  sourceProvenance?: SourceProvenance // Repository/ref/build metadata for the preferred build-info source

  // Internal Management - tracks all file paths from which this contract's data was hydrated
  _sources: Set<string>
  _sourceProvenance?: Map<string, SourceProvenance>
}
