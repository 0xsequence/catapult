export interface SourceProvenance {
  repo: string
  ref?: string
  commit?: string
  build?: string
  /**
   * Optional Docker image to run the `build` command inside. When set, Catapult
   * executes the build in `docker run <image>` with the checkout mounted, instead
   * of running it directly on the host. This pins the build toolchain per entry
   * and keeps the host/runner untouched.
   */
  image?: string
  sourceDocumentPath?: string
  buildInfoPath?: string
}

export interface SourceProvenanceOverride {
  repo?: string
  ref?: string
  commit?: string
  build?: string
  image?: string
}

export interface BuildInfoSourceProvenance extends SourceProvenance {
  contracts?: Record<string, SourceProvenanceOverride>
}

export interface SourceDocument {
  type: 'source'
  build_info: Record<string, BuildInfoSourceProvenance>
  warnings?: string[]
  _path?: string
}
