import { Network } from './network'

/**
 * Represents a deployment project with its associated networks
 */
export interface Project {
  /** List of networks available for this project */
  networks: Network[]
} 