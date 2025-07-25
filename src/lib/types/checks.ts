import { Backlink } from './backlink'

// Base interface for all check types
interface BaseCheck {
  type: string
}

// Contract code check - validates that a contract has code at the given address
export interface ContractCodeCheck extends BaseCheck {
  type: 'contract-code'
  address: Backlink
}

// Call equal check - makes a call and validates the result equals expected value
export interface CallEqualCheck extends BaseCheck {
  type: 'call-equal'
  address: Backlink
  data: Backlink
  expectedValue: Backlink
}

// Union type of all check types
export type Check = ContractCodeCheck | CallEqualCheck
