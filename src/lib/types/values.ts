/**
 * Represents a reference to another value in the scope, e.g., "{{var.name}}".
 * The parser will be responsible for resolving this string into a concrete value.
 */
export type Reference = string;

// --- Value Resolver Types ---
// These are declarative objects that describe how to compute a value at runtime.

export interface AbiEncodeValue {
  type: 'abi-encode';
  arguments: {
    signature: Value<string>;
    values: Value<any>[];
  };
}

export interface AbiPackValue {
  type: 'abi-pack';
  arguments: {
    types: Value<string>[];
    values: Value<any>[];
  };
}

export interface ConstructorEncodeValue {
  type: 'constructor-encode';
  arguments: {
    creationCode?: Value<string>;
    types: Value<string>[];
    values: Value<any>[];
  };
}

export interface ComputeCreateValue {
  type: 'compute-create';
  arguments: {
    deployerAddress: AddressValue;
    nonce: Uint256Value;
  };
}

export interface ComputeCreate2Value {
  type: 'compute-create2';
  arguments: {
    deployerAddress: AddressValue;
    salt: BytesValue;
    initCode: BytesValue;
  };
}

export interface ReadBalanceValue {
  type: 'read-balance';
  arguments: {
    address: AddressValue;
  };
}

export interface BasicArithmeticValue {
  type: 'basic-arithmetic';
  arguments: {
    operation: 'add' | 'sub' | 'mul' | 'div' | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
    values: Value<any>[];
  };
}

export interface CallValue {
    type: 'call';
    arguments: {
        to?: AddressValue; // Optional, can be inferred from context by the parser
        signature: Value<string>;
        values: Value<any>[];
    };
}

export interface ContractExistsValue {
    type: 'contract-exists';
    arguments: {
        address: AddressValue;
    };
}

export interface JobCompletedValue {
    type: 'job-completed';
    arguments: {
        job: Value<string>;
    };
}

export interface ReadJsonValue {
    type: 'read-json';
    arguments: {
        json: Value<any>; // The JSON object to read from
        path: Value<string>; // The path to the value (e.g., "txs.data" or "user.profile.name")
    };
}

/**
 * A union of all possible value-resolver objects.
 */
export type ValueResolver =
  | AbiEncodeValue
  | AbiPackValue
  | ConstructorEncodeValue
  | ComputeCreateValue
  | ComputeCreate2Value
  | ReadBalanceValue
  | BasicArithmeticValue
  | CallValue
  | ContractExistsValue
  | JobCompletedValue
  | ReadJsonValue;

/**
 * A generic value type that can be a primitive literal (string, number, boolean),
 * a reference to another value, or a value-resolver object.
 * This accurately models the flexibility of your YAML arguments.
 */
export type Value<T = string | number | boolean> = T | Reference | ValueResolver;

// --- Specific Value Types for clarity and type-safety ---
export type BytesValue = Value<string>;
export type AddressValue = Value<string>;
export type Uint256Value = Value<string | number>;
export type BooleanValue = Value<boolean>;
