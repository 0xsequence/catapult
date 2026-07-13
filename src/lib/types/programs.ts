export interface SvmProgram {
  platform: 'svm'
  name: string
  uniqueHash: string
  binaryPath: string
  byteLength: number
  idl?: Record<string, unknown>
  idlPath?: string
}
