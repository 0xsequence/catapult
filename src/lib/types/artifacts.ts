export interface CompilerInfo {
  version: string
  // Future settings like optimizer runs can be added here
}

export interface Artifact {
  // --- Core Information ---
  contractName: string
  abi: any[]
  bytecode: string // aka creationCode, initCode

  // --- Optional Information for Verification & Debugging ---
  deployedBytecode?: string // aka runtimeBytecode
  sourceName?: string       // e.g., "contracts/MyContract.sol"
  source?: string           // The full source code content for verification
  compiler?: CompilerInfo

  // --- Internal Management Properties (added by the loader) ---
  _path: string // The absolute path to the artifact file
  _hash: string // A hash of the artifact file's content (e.g., MD5)
}