"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateAddress = validateAddress;
exports.validateHexData = validateHexData;
exports.validateBigNumberish = validateBigNumberish;
exports.validateRawTransaction = validateRawTransaction;
function validateAddress(value, actionName) {
    if (typeof value !== 'string') {
        throw new Error(`Invalid 'to' address for action "${actionName}": expected string, got ${typeof value}`);
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new Error(`Invalid 'to' address format for action "${actionName}": ${value}`);
    }
    return value;
}
function validateHexData(value, actionName, fieldName) {
    if (value === null || value === undefined) {
        return '0x';
    }
    if (typeof value !== 'string') {
        throw new Error(`Invalid '${fieldName}' for action "${actionName}": expected string, got ${typeof value}`);
    }
    if (!value.startsWith('0x')) {
        throw new Error(`Invalid '${fieldName}' format for action "${actionName}": must start with '0x', got ${value}`);
    }
    if (value.length > 2 && !/^0x[a-fA-F0-9]*$/.test(value)) {
        throw new Error(`Invalid '${fieldName}' format for action "${actionName}": contains non-hex characters: ${value}`);
    }
    return value;
}
function validateBigNumberish(value, actionName, fieldName) {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === 'number') {
        if (!Number.isInteger(value) || value < 0) {
            throw new Error(`Invalid '${fieldName}' for action "${actionName}": must be a non-negative integer, got ${value}`);
        }
        return value;
    }
    if (typeof value === 'string') {
        if (value.startsWith('0x')) {
            if (!/^0x[a-fA-F0-9]+$/.test(value)) {
                throw new Error(`Invalid '${fieldName}' hex format for action "${actionName}": ${value}`);
            }
            return value;
        }
        if (!/^\d+$/.test(value)) {
            throw new Error(`Invalid '${fieldName}' format for action "${actionName}": must be a number or hex string, got ${value}`);
        }
        return value;
    }
    if (typeof value === 'bigint') {
        if (value < 0n) {
            throw new Error(`Invalid '${fieldName}' for action "${actionName}": must be non-negative, got ${value}`);
        }
        return value;
    }
    throw new Error(`Invalid '${fieldName}' type for action "${actionName}": expected number, string, or bigint, got ${typeof value}`);
}
function validateRawTransaction(value, actionName) {
    if (typeof value !== 'string') {
        throw new Error(`Invalid raw transaction for action "${actionName}": expected string, got ${typeof value}`);
    }
    const trimmed = value.trim();
    const withoutPrefix = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (withoutPrefix.length === 0) {
        return '0x';
    }
    if (!/^[a-fA-F0-9]+$/.test(withoutPrefix)) {
        const idx = withoutPrefix.search(/[^a-fA-F0-9]/);
        const marker = idx >= 0 ? ` at index ${idx} ('${withoutPrefix[idx]}')` : '';
        throw new Error(`Invalid raw transaction format for action "${actionName}": contains non-hex characters${marker}: ${value}`);
    }
    return '0x' + withoutPrefix;
}
//# sourceMappingURL=validation.js.map