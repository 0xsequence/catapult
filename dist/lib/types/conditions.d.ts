import { AddressValue, BooleanValue, ValueEmptyValue } from './values';
export interface ContractExistsCondition {
    type: 'contract-exists';
    arguments: {
        address: AddressValue;
    };
}
export declare function isContractExistsCondition(obj: any): obj is ContractExistsCondition;
export interface JobCompletedCondition {
    type: 'job-completed';
    arguments: {
        job: string;
    };
}
export declare function isJobCompletedCondition(obj: any): obj is JobCompletedCondition;
export type Condition = BooleanValue | ContractExistsCondition | JobCompletedCondition | ValueEmptyValue;
//# sourceMappingURL=conditions.d.ts.map