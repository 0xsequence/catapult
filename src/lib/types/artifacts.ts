export interface Artifact {
  contractName: string
  abi: any[]
  bytecode: string
  // May include other fields from compiler output like deployedBytecode, sourceName etc.
}