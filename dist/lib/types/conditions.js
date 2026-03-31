"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isContractExistsCondition = isContractExistsCondition;
exports.isJobCompletedCondition = isJobCompletedCondition;
function isContractExistsCondition(obj) {
    return (obj &&
        typeof obj === 'object' &&
        obj.type === 'contract-exists' &&
        obj.arguments &&
        typeof obj.arguments === 'object' &&
        'address' in obj.arguments);
}
function isJobCompletedCondition(obj) {
    return (obj &&
        typeof obj === 'object' &&
        obj.type === 'job-completed' &&
        obj.arguments &&
        typeof obj.arguments === 'object' &&
        typeof obj.arguments.job === 'string');
}
//# sourceMappingURL=conditions.js.map