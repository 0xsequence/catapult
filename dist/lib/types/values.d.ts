export type Reference = string;
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
export type ComputeSlotArguments = {
    kind: 'mapping';
    slot: Value<string | number>;
    key: Value<string | number | boolean>;
    keyType?: Value<string>;
} | {
    kind: 'dynamic-array';
    slot: Value<string | number>;
    index?: Value<string | number>;
    elementSize?: Value<string | number>;
} | {
    kind: 'struct-field';
    slot: Value<string | number>;
    offset: Value<string | number>;
} | {
    kind: 'erc7201';
    id: Value<string>;
} | {
    kind: 'eip1967';
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
        to?: AddressValue;
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
        json: Value<any>;
        path: Value<string | number>;
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
export type ValueResolver = AbiEncodeValue | AbiPackValue | ConstructorEncodeValue | ComputeCreateValue | ComputeCreate2Value | ReadBalanceValue | GetStorageAtValue | ComputeSlotValue | BasicArithmeticValue | CallValue | ContractExistsValue | JobCompletedValue | ReadJsonValue | ResolveJsonValue | ValueEmptyValue | SliceBytesValue;
export type Value<T = string | number | boolean> = T | Reference | ValueResolver;
export type BytesValue = Value<string>;
export type AddressValue = Value<string>;
export type Uint256Value = Value<string | number>;
export type BooleanValue = Value<boolean>;
//# sourceMappingURL=values.d.ts.map