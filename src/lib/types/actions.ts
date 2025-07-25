import { Backlink } from './backlink'

export type GenericAction = {
  arguments: Record<string, Backlink>
  returns: Record<string, Backlink>
}

export type SendTransactionAction = GenericAction & {
  type: 'send-transaction'
  arguments: {
    to: Backlink
    value?: Backlink
    data?: Backlink
  }
  returns: {
    transactionHash: Backlink
    success: Backlink
  }
}

export type SendPresignedTransactionAction = GenericAction & {
  type: 'send-presigned-transaction'
  arguments: {
    presignedTransaction: Backlink
  }
  returns: {
    success: Backlink
  }
}

export type AbiEncodeAction = GenericAction & {
  type: 'abi-encode'
  arguments: {
    signature: Backlink
    values: Backlink[]
  }
  returns: {
    encoded: Backlink
  }
}

export type ConstantAction = GenericAction & {
  type: 'constant'
  value: string
  returns: {
    result: Backlink
  }
}

export type ComputeCreate2Action = GenericAction & {
  type: 'compute-create2'
  arguments: {
    deployerAddress: Backlink
    salt: Backlink
    initCode: Backlink
  }
  returns: {
    address: Backlink
  }
}

export type TemplatedAction<T extends ActionTemplate = ActionTemplate> = {
  type: 'templated'
  template: T
  arguments: Record<T['arguments'][number], Backlink>
  returns: Record<T['returns'][number], Backlink>
}

export type Action = SendTransactionAction | SendPresignedTransactionAction | AbiEncodeAction | ConstantAction | ComputeCreate2Action | TemplatedAction

export interface ActionTemplate {
  /** The unique name of the template (e.g., 'universal-deployer-v2') */
  name: string
  /** A list of named inputs that this template accepts */
  arguments: string[]
  /** A list of named outputs that this template returns */
  returns: string[]
  /** The sequence of actions to be executed */
  actions: Action[]
  /** A backlink that defines the final output of the template */
  outputs: Record<string, Backlink>
}
