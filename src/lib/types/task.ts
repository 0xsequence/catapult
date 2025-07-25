import { Action } from './actions'
import { Check } from './checks'

export interface Task {
  name: string
  description?: string
  action: Action
  checks: Check[]
} 