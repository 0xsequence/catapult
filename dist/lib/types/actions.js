"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIMITIVE_ACTION_TYPES = void 0;
exports.isPrimitiveActionType = isPrimitiveActionType;
const primitiveActionTypes = [
    'send-transaction',
    'send-signed-transaction',
    'verify-contract',
    'static',
    'create-contract',
    'test-nicks-method',
    'json-request',
];
exports.PRIMITIVE_ACTION_TYPES = new Set(primitiveActionTypes);
function isPrimitiveActionType(type) {
    return exports.PRIMITIVE_ACTION_TYPES.has(type);
}
//# sourceMappingURL=actions.js.map