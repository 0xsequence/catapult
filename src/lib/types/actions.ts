import { AddressValue, BytesValue, Uint256Value, Value } from './values'
import { Contract } from './contracts'
import { Condition } from './conditions'

// --- Primitive Actions ---
// These are the basic building blocks that interact with the blockchain.

export interface SendTransactionAction {
  type: 'send-transaction';
  arguments: {
    to: AddressValue;
    value?: Uint256Value;
    data?: BytesValue;
    gasMultiplier?: number;
  };
}

export interface SendSignedTransactionAction {
  type: 'send-signed-transaction';
  arguments: {
    transaction: BytesValue;
  };
}

export interface VerifyContractAction {
  type: 'verify-contract';
  arguments: {
    address: AddressValue;
    contract: Value<Contract>; // The contract to verify
    constructorArguments?: BytesValue; // Optional constructor args as hex string
    platform?: Value<string | string[]>; // Platform(s) to verify on, defaults to "all" (tries all configured platforms)
  };
}

export interface StaticAction {
  type: 'static';
  arguments: {
    value: Value<any>;
  };
}

export interface TestNicksMethodAction {
  type: 'test-nicks-method';
  arguments: {
    bytecode?: BytesValue;
    gasPrice?: Uint256Value;
    gasLimit?: Uint256Value;
    fundingAmount?: Uint256Value;
  };
}

// A union of all primitive action types.
export type PrimitiveAction = SendTransactionAction | SendSignedTransactionAction | VerifyContractAction | StaticAction | TestNicksMethodAction;

const primitiveActionTypes = [
  'send-transaction',
  'send-signed-transaction',
  'verify-contract',
  'static',
  'test-nicks-method',
] as const;

/**
 * A set of all built-in primitive action types.
 * This is useful for efficiently checking if an action type is a primitive.
 */
export const PRIMITIVE_ACTION_TYPES = new Set<string>(primitiveActionTypes);

/**
 * A type guard to check if a given action `type` corresponds to a primitive action.
 * @param type The action type string.
 * @returns `true` if the type is a primitive action type.
 */
export function isPrimitiveActionType(type: string): type is (typeof primitiveActionTypes)[number] {
  return PRIMITIVE_ACTION_TYPES.has(type);
}

// --- Template Call Action ---
// In your YAML, using another template as an action is done by specifying its name
// in the 'type' field (e.g., `type: 'min-balance'`). This type captures that pattern.

export interface TemplateCallAction {
  /**
   * The name of the template to call, e.g., 'min-balance'.
   * This property acts as a discriminator.
   */
  type: string;
  arguments: Record<string, Value<any>>;
}

/**
 * An Action is what appears in a `actions` array in your YAML.
 * It's either a primitive action or a call to another template.
 *
 * The `type` field is used to discriminate. Your parser will need to have a list
 * of known primitive action types (`send-transaction`, etc.) to distinguish them
 * from template names.
 */
export type Action = (PrimitiveAction | TemplateCallAction) & {
  /** An optional name for the action, allowing its outputs to be referenced. */
  name?: string;
  /** A list of conditions that, if any are met, will cause this action to be skipped. */
  skip_condition?: Condition[];
  /** A list of action names within the same job/template that must complete first. */
  depends_on?: string[];
};