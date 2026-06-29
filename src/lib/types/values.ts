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

export interface GetStorageAtValue {
  type: 'get-storage-at';
  arguments: {
    address: AddressValue;
    slot: Value<string | number>;
  };
}

/**
 * Computes EVM storage slots for common Solidity storage layouts.
 *
 * The result is always returned as a 32-byte, 0x-prefixed lowercase hex string,
 * so it can be fed directly into `get-storage-at` or nested as the `slot` of
 * another `compute-slot` (e.g. for nested mappings).
 */
export type ComputeSlotArguments =
  | {
      /** Value at `mapping[key]`: keccak256(h(key) . slot). */
      kind: 'mapping';
      /** Declaration slot of the mapping. */
      slot: Value<string | number>;
      /** The mapping key. */
      key: Value<string | number | boolean>;
      /**
       * Solidity type of the key, used to encode it (default: "uint256").
       * Value types (address, uint*, int*, bytes32, bool, ...) are ABI-encoded
       * and left-padded; dynamic types ("string", "bytes") are packed.
       */
      keyType?: Value<string>;
    }
  | {
      /** Element of a dynamic array: keccak256(slot) + index * elementSize. */
      kind: 'dynamic-array';
      /** Declaration slot of the array (also where its length lives). */
      slot: Value<string | number>;
      /** Element index (default: 0). */
      index?: Value<string | number>;
      /** Number of slots each element occupies (default: 1). */
      elementSize?: Value<string | number>;
    }
  | {
      /** Field of a struct or fixed-size array element: slot + offset. */
      kind: 'struct-field';
      /** Base slot of the struct / array element. */
      slot: Value<string | number>;
      /** Field offset in slots from the base. */
      offset: Value<string | number>;
    }
  | {
      /**
       * ERC-7201 namespaced storage root:
       * keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~bytes32(uint256(0xff)).
       */
      kind: 'erc7201';
      /** The namespace id, e.g. "openzeppelin.storage.Ownable". */
      id: Value<string>;
    }
  | {
      /** Well-known EIP-1967 proxy slot: keccak256("eip1967.proxy.<name>") - 1. */
      kind: 'eip1967';
      /** Which proxy slot to compute. */
      name: Value<'implementation' | 'admin' | 'beacon'>;
    };

export interface ComputeSlotValue {
  type: 'compute-slot';
  arguments: ComputeSlotArguments;
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
        path: Value<string | number>; // The path to the value (e.g., "txs.data", 1, or "user.profile.name")
    };
}

export interface ResolveJsonValue {
  type: 'resolve-json';
  arguments: Value<any>;
}

export interface ValueEmptyValue {
  type: 'value-empty';
  arguments: {
    value: Value<any>;
  };
}

export interface SliceBytesValue {
  type: 'slice-bytes';
  arguments: {
    value: BytesValue;
    start?: Value<number | string>;
    end?: Value<number | string>;
    range?: Value<string>;
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
  | GetStorageAtValue
  | ComputeSlotValue
  | BasicArithmeticValue
  | CallValue
  | ContractExistsValue
  | JobCompletedValue
  | ReadJsonValue
  | ResolveJsonValue
  | ValueEmptyValue
  | SliceBytesValue;

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
