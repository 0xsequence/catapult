export interface BuildInfoSource {
  content?: string
  urls?: string[]
  keccak256?: string
}

export interface BuildInfoInput {
  language: string
  sources: Record<string, BuildInfoSource>
  settings: {
    optimizer?: {
      enabled: boolean
      runs: number
    }
    evmVersion?: string
    remappings?: string[]
    viaIR?: boolean
    libraries?: Record<string, Record<string, string>>
    outputSelection: Record<string, Record<string, string[]>>
    [key: string]: any
  }
}

export interface BuildInfoError {
  component?: string
  errorCode?: string
  formattedMessage?: string
  message?: string
  severity?: 'error' | 'warning' | 'info'
  sourceLocation?: {
    file: string
    start: number
    end: number
  }
  type?: string
}

export interface BuildInfoBytecode {
  functionDebugData?: Record<string, any>
  generatedSources?: any[]
  linkReferences?: Record<string, Record<string, Array<{ length: number; start: number }>>>
  object: string
  opcodes?: string
  sourceMap?: string
}

export interface BuildInfoContract {
  abi: any[]
  metadata?: string
  storageLayout?: {
    storage: Array<{
      astId: number
      contract: string
      label: string
      offset: number
      slot: string
      type: string
    }>
    types: Record<string, {
      encoding: string
      label: string
      numberOfBytes: string
      [key: string]: any
    }>
  }
  userdoc?: any
  devdoc?: any
  ir?: string
  irOptimized?: string
  evm: {
    assembly?: string
    legacyAssembly?: any
    bytecode: BuildInfoBytecode
    deployedBytecode: BuildInfoBytecode
    methodIdentifiers?: Record<string, string>
    gasEstimates?: any
  }
}

export interface BuildInfoOutput {
  errors?: BuildInfoError[]
  sources: Record<string, {
    id: number
    ast?: any
  }>
  contracts: Record<string, Record<string, BuildInfoContract>>
}

export interface BuildInfo {
  _format?: 'hh-sol-build-info-1' | 'ethers-rs-sol-build-info-1' // Optional for factory-style formats
  id: string
  solcVersion: string
  solcLongVersion?: string // Optional for factory-style formats
  input: BuildInfoInput
  output: BuildInfoOutput
  // Optional extension keys for zkSync/zkEVM
  zksolcVersion?: string
  eraVersion?: string
  zkevmVersion?: string
  [key: string]: any // Allow additional unknown keys for forward compatibility
}

export interface ExtractedContract {
  contractName: string
  sourceName: string
  fullyQualifiedName: string // e.g., "src/Counter.sol:Counter"
  abi: any[]
  bytecode: string
  deployedBytecode?: string
  source?: string
  compiler: {
    version: string
  }
  buildInfoId: string
  buildInfoPath?: string
} 