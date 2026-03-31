import { AddressValue, BytesValue, Uint256Value, Value } from './values';
import { Contract } from './contracts';
import { Condition } from './conditions';
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
        contract: Value<Contract>;
        constructorArguments?: BytesValue;
        platform?: Value<string | string[]>;
    };
}
export interface StaticAction {
    type: 'static';
    arguments: {
        value: Value<any>;
    };
}
export interface CreateContractAction {
    type: 'create-contract';
    arguments: {
        data: BytesValue;
        value?: Uint256Value;
        gasMultiplier?: number;
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
export interface JsonRequestAction {
    type: 'json-request';
    arguments: {
        url: Value<string>;
        method?: Value<string>;
        headers?: Value<Record<string, string>>;
        body?: Value<any>;
    };
}
export type PrimitiveAction = SendTransactionAction | SendSignedTransactionAction | VerifyContractAction | StaticAction | CreateContractAction | TestNicksMethodAction | JsonRequestAction;
declare const primitiveActionTypes: readonly ["send-transaction", "send-signed-transaction", "verify-contract", "static", "create-contract", "test-nicks-method", "json-request"];
export declare const PRIMITIVE_ACTION_TYPES: Set<string>;
export declare function isPrimitiveActionType(type: string): type is (typeof primitiveActionTypes)[number];
export interface TemplateCallAction {
    type: string;
    arguments: Record<string, Value<any>>;
}
export type Action = (PrimitiveAction | TemplateCallAction) & {
    name?: string;
    skip_condition?: Condition[];
    depends_on?: string[];
};
export {};
//# sourceMappingURL=actions.d.ts.map