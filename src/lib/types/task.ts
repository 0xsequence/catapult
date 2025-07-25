import { Action } from './actions'
import { Condition } from './conditions'

export interface Task {
  name: string
  description?: string
  action: Action
  checks: Condition[]
} 