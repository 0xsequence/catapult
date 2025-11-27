import { AddressValue, BooleanValue } from './values'

/**
 * A condition that checks if a contract has code at a given address.
 */
export interface ContractExistsCondition {
    type: 'contract-exists';
    arguments: {
        address: AddressValue;
    };
}

export function isContractExistsCondition(obj: any): obj is ContractExistsCondition {
    return (
        obj &&
        typeof obj === 'object' &&
        obj.type === 'contract-exists' &&
        obj.arguments &&
        typeof obj.arguments === 'object' &&
        'address' in obj.arguments
    );
}

/**
 * A condition that checks if a dependency job has been successfully completed.
 */
export interface JobCompletedCondition {
    type: 'job-completed';
    arguments: {
        job: string;
    };
}

export function isJobCompletedCondition(obj: any): obj is JobCompletedCondition {
    return (
        obj &&
        typeof obj === 'object' &&
        obj.type === 'job-completed' &&
        obj.arguments &&
        typeof obj.arguments === 'object' &&
        typeof obj.arguments.job === 'string'
    );
}

/**
 * A condition is something that resolves to a boolean. It can be a specific
 * check type like 'contract-exists', or any ValueResolverSpec that produces a
 * boolean result (e.g., `basic-arithmetic` with an 'eq' operation).
 */
export type Condition = BooleanValue | ContractExistsCondition | JobCompletedCondition;