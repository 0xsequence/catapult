"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValueResolver = void 0;
const ethers_1 = require("ethers");
const assertion_1 = require("../utils/assertion");
class ValueResolver {
    async resolve(value, context, scope = new Map()) {
        if (typeof value !== 'string' && (typeof value !== 'object' || value === null)) {
            return value;
        }
        if (typeof value === 'string') {
            const refMatch = value.match(/^{{(.*)}}$/);
            if (refMatch) {
                const expression = refMatch[1].trim();
                return this.resolveExpression(expression, context, scope);
            }
            return value;
        }
        if (Array.isArray(value)) {
            return Promise.all(value.map(item => this.resolve(item, context, scope)));
        }
        if (typeof value === 'object' && 'type' in value) {
            return this.resolveValueResolverObject(value, context, scope);
        }
        if (typeof value === 'object') {
            return value;
        }
        throw new Error(`Cannot resolve value: unexpected value type: ${typeof value}`);
    }
    async resolveExpression(expression, context, scope) {
        const contractMatch = expression.match(/^Contract\((.*?)\)(\.\w+)?$/);
        if (contractMatch) {
            const [, reference, property] = contractMatch;
            const contractRef = reference.trim();
            const contract = context.contractRepository.lookup(contractRef, context.getContextPath());
            if (!contract) {
                const ctx = context.getContextPath();
                throw new Error(`Artifact not found for reference: "${contractRef}" (resolved relative to: ${ctx ?? 'N/A'}). ` +
                    `Ensure the path and contract name are correct and that the build-info/artifact is discoverable.`);
            }
            if (!property) {
                return contract;
            }
            const propName = property.substring(1);
            const value = contract[propName];
            if (value === undefined) {
                throw new Error(`Property "${propName}" does not exist on contract found for reference "${contractRef}"`);
            }
            return value;
        }
        const networkMatch = expression.match(/^Network\(\)\.(\w+)$/);
        if (networkMatch) {
            const [, property] = networkMatch;
            const network = context.getNetwork();
            if (property === 'testnet') {
                return !!network.testnet;
            }
            const value = network[property];
            if (value === undefined) {
                throw new Error(`Property "${property}" does not exist on network`);
            }
            return value;
        }
        if (scope.has(expression)) {
            return scope.get(expression);
        }
        const constantValue = context.getConstant?.(expression);
        if (constantValue !== undefined) {
            return constantValue;
        }
        try {
            return context.getOutput(expression);
        }
        catch (e) {
            throw new Error(`Failed to resolve expression "{{${expression}}}". It is not a valid Contract(...) or Network() reference, local scope variable, constant, or a known output.`);
        }
    }
    async resolveValueResolverObject(obj, context, scope) {
        const resolvedArgs = await this.resolveArguments(obj.arguments, context, scope);
        switch (obj.type) {
            case 'abi-encode':
                return this.resolveAbiEncode(resolvedArgs);
            case 'abi-pack':
                return this.resolveAbiPack(resolvedArgs);
            case 'constructor-encode':
                return this.resolveConstructorEncode(resolvedArgs);
            case 'compute-create':
                return this.resolveComputeCreate(resolvedArgs);
            case 'compute-create2':
                return this.resolveComputeCreate2(resolvedArgs);
            case 'read-balance':
                return this.resolveReadBalance(resolvedArgs, context);
            case 'basic-arithmetic':
                return this.resolveBasicArithmetic(resolvedArgs);
            case 'call':
                return this.resolveCall(resolvedArgs, context);
            case 'contract-exists':
                return this.resolveContractExists(resolvedArgs, context);
            case 'job-completed':
                return this.resolveJobCompleted(resolvedArgs, context);
            case 'read-json':
                return this.resolveReadJson(resolvedArgs);
            case 'resolve-json':
                return this.resolveJsonValue(resolvedArgs, context);
            case 'value-empty':
                return this.resolveValueEmpty(resolvedArgs);
            case 'slice-bytes':
                return this.resolveSliceBytes(resolvedArgs);
            default:
                throw new Error(`Unknown value resolver type: ${obj.type}`);
        }
    }
    resolveAbiEncode(args) {
        const { signature, values } = args;
        if (!signature) {
            throw new Error('abi-encode: signature is required');
        }
        if (!values) {
            throw new Error('abi-encode: values array is required');
        }
        const signatureStr = signature;
        if (typeof signatureStr !== 'string') {
            throw new Error('abi-encode: signature must be a string');
        }
        try {
            const iface = new ethers_1.ethers.Interface([`function ${signatureStr}`]);
            const functionName = signatureStr.split('(')[0];
            return iface.encodeFunctionData(functionName, values);
        }
        catch (error) {
            throw new Error(`abi-encode: Failed to encode function data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    resolveAbiPack(args) {
        const { types, values } = args;
        if (!types) {
            throw new Error('abi-pack: types array is required');
        }
        if (!values) {
            throw new Error('abi-pack: values array is required');
        }
        if (types.length !== values.length) {
            throw new Error(`abi-pack: types array length (${types.length}) must match values array length (${values.length})`);
        }
        const typesArray = types;
        if (!typesArray.every(type => typeof type === 'string')) {
            throw new Error('abi-pack: all types must be strings');
        }
        try {
            return ethers_1.ethers.solidityPacked(typesArray, values);
        }
        catch (error) {
            throw new Error(`abi-pack: Failed to pack values: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    resolveConstructorEncode(args) {
        const { creationCode, types, values } = args;
        if (types && values && types.length !== values.length) {
            throw new Error(`constructor-encode: types array length (${types.length}) must match values array length (${values.length})`);
        }
        if (!creationCode) {
            if (!types || !values || types.length === 0 || values.length === 0) {
                return '0x';
            }
            return ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(types, values);
        }
        if (!(0, assertion_1.isBytesLike)(creationCode)) {
            throw new Error(`Invalid creation code: ${creationCode}`);
        }
        if (!types || !values || types.length === 0 || values.length === 0) {
            return creationCode;
        }
        const encodedArgs = ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(types, values);
        const cleanEncodedArgs = encodedArgs.startsWith('0x') ? encodedArgs.slice(2) : encodedArgs;
        const cleanCreationCode = creationCode.startsWith('0x') ? creationCode.slice(2) : creationCode;
        return '0x' + cleanCreationCode + cleanEncodedArgs;
    }
    resolveComputeCreate(args) {
        const { deployerAddress, nonce } = args;
        if (!(0, assertion_1.isAddress)(deployerAddress)) {
            throw new Error(`Invalid deployer address: ${deployerAddress}`);
        }
        if (!(0, assertion_1.isBigNumberish)(nonce)) {
            throw new Error(`Invalid nonce: ${nonce}`);
        }
        const bnNonce = ethers_1.ethers.toBigInt(nonce);
        return ethers_1.ethers.getCreateAddress({
            from: deployerAddress,
            nonce: bnNonce,
        });
    }
    resolveComputeCreate2(args) {
        const { deployerAddress, salt, initCode } = args;
        if (!(0, assertion_1.isAddress)(deployerAddress)) {
            throw new Error(`Invalid deployer address: ${deployerAddress}`);
        }
        if (!(0, assertion_1.isBytesLike)(salt)) {
            throw new Error(`Invalid salt: ${salt}`);
        }
        if (!(0, assertion_1.isBytesLike)(initCode)) {
            throw new Error(`Invalid init code: ${initCode}`);
        }
        const initCodeHash = ethers_1.ethers.keccak256(initCode);
        return ethers_1.ethers.getCreate2Address(deployerAddress, salt, initCodeHash);
    }
    async resolveReadBalance(args, context) {
        const addressValue = args.address;
        if (!(0, assertion_1.isAddress)(addressValue)) {
            throw new Error(`Invalid address: ${addressValue}`);
        }
        const balance = await context.provider.getBalance(addressValue);
        return balance.toString();
    }
    resolveBasicArithmetic(args) {
        if (!args.values || args.values.length < 2) {
            throw new Error(`basic-arithmetic requires at least 2 values, got ${args.values?.length ?? 0}`);
        }
        switch (args.operation) {
            case 'eq': {
                const [a, b] = args.values;
                return this.valuesEqual(a, b);
            }
            case 'neq': {
                const [a, b] = args.values;
                return !this.valuesEqual(a, b);
            }
            case 'add':
            case 'sub':
            case 'mul':
            case 'div':
            case 'gt':
            case 'lt':
            case 'gte':
            case 'lte':
                break;
            default:
                throw new Error(`Unsupported basic-arithmetic operation: ${args.operation}`);
        }
        const numbers = args.values.map(v => ethers_1.ethers.toBigInt(v));
        const [a, b] = numbers;
        switch (args.operation) {
            case 'add': return numbers.reduce((sum, current) => sum + current).toString();
            case 'sub': return (a - b).toString();
            case 'mul': return (a * b).toString();
            case 'div': return (a / b).toString();
            case 'gt': return a > b;
            case 'lt': return a < b;
            case 'gte': return a >= b;
            case 'lte': return a <= b;
            default:
                throw new Error(`Unsupported basic-arithmetic operation: ${args.operation}`);
        }
    }
    valuesEqual(a, b) {
        if (a == null || b == null) {
            return a == null && b == null;
        }
        if ((0, assertion_1.isBigNumberish)(a) && (0, assertion_1.isBigNumberish)(b)) {
            return ethers_1.ethers.toBigInt(a) === ethers_1.ethers.toBigInt(b);
        }
        if (typeof a === 'string' && typeof b === 'string') {
            return a === b;
        }
        if (typeof a === 'boolean' && typeof b === 'boolean') {
            return a === b;
        }
        if ((typeof a === 'object' && a !== null) || (typeof b === 'object' && b !== null)) {
            return JSON.stringify(a) === JSON.stringify(b);
        }
        return a === b;
    }
    async resolveCall(args, context) {
        const { to, signature, values } = args;
        if (!to) {
            throw new Error('call: target address (to) is required');
        }
        if (!(0, assertion_1.isAddress)(to)) {
            throw new Error(`call: invalid target address: ${to}`);
        }
        if (!signature) {
            throw new Error('call: function signature is required');
        }
        if (!values) {
            throw new Error('call: values array is required');
        }
        const signatureStr = signature;
        if (typeof signatureStr !== 'string') {
            throw new Error('call: signature must be a string');
        }
        try {
            const iface = new ethers_1.ethers.Interface([`function ${signatureStr}`]);
            const functionName = signatureStr.split('(')[0];
            const callData = iface.encodeFunctionData(functionName, values);
            const result = await context.provider.call({
                to: to,
                data: callData
            });
            if (result === '0x') {
                return null;
            }
            const decodedResult = iface.decodeFunctionResult(functionName, result);
            if (decodedResult.length === 1) {
                return decodedResult[0];
            }
            return decodedResult;
        }
        catch (error) {
            throw new Error(`call: Failed to execute contract call: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async resolveContractExists(args, context) {
        const { address } = args;
        if (!(0, assertion_1.isAddress)(address)) {
            throw new Error(`contract-exists: invalid address: ${address}`);
        }
        try {
            const code = await context.provider.getCode(address);
            return code !== '0x';
        }
        catch (error) {
            throw new Error(`contract-exists: Failed to check contract existence: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async resolveJobCompleted(args, context) {
        const { job: jobName } = args;
        return true;
    }
    resolveReadJson(args) {
        const { json, path } = args;
        if (json === undefined || json === null) {
            throw new Error('read-json: json argument is required');
        }
        if (typeof path !== 'string' && typeof path !== 'number') {
            throw new Error('read-json: path must be a string or number');
        }
        const normalizedPath = String(path);
        if (normalizedPath === '') {
            return json;
        }
        try {
            const pathParts = normalizedPath.split('.');
            let current = json;
            for (const part of pathParts) {
                if (current === null || current === undefined) {
                    throw new Error(`Cannot access property "${part}" of ${current}`);
                }
                const index = parseInt(part, 10);
                if (!isNaN(index) && Array.isArray(current)) {
                    current = current[index];
                }
                else if (typeof current === 'object') {
                    current = current[part];
                }
                else {
                    throw new Error(`Cannot access property "${part}" of non-object value`);
                }
            }
            return current;
        }
        catch (error) {
            throw new Error(`read-json: Failed to access path "${normalizedPath}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async resolveJsonValue(args, context) {
        if (Array.isArray(args)) {
            return Promise.all(args.map(v => this.resolveJsonValue(v, context)));
        }
        else if (typeof args === 'object' && args !== null) {
            const resolved = {};
            for (const [k, v] of Object.entries(args)) {
                resolved[k] = await this.resolveJsonValue(v, context);
            }
            return resolved;
        }
        else {
            return this.resolve(args, context);
        }
    }
    resolveValueEmpty(args) {
        const { value } = args;
        if (value === undefined || value === null) {
            return true;
        }
        if (typeof value === 'string') {
            return value === '' || value === '0x';
        }
        if (Array.isArray(value)) {
            return value.length === 0;
        }
        if (typeof value === 'object') {
            return Object.keys(value).length === 0;
        }
        return false;
    }
    resolveSliceBytes(args) {
        const { value, start, end, range } = args;
        if (!(0, assertion_1.isBytesLike)(value)) {
            throw new Error('slice-bytes: value must be bytes-like (hex string, Uint8Array, etc.)');
        }
        if (range !== undefined && (start !== undefined || end !== undefined)) {
            throw new Error('slice-bytes: provide either range or start/end, not both');
        }
        if (range !== undefined && typeof range !== 'string') {
            throw new Error('slice-bytes: range must be a string in "start:end" format');
        }
        const normalizedHex = ethers_1.ethers.hexlify(value);
        const hexBody = normalizedHex.slice(2);
        if (hexBody.length % 2 !== 0) {
            throw new Error('slice-bytes: value must have an even-length hex string');
        }
        const totalBytes = hexBody.length / 2;
        const { startIndex, endIndex } = this.computeSliceBounds(totalBytes, { start, end, range });
        if (startIndex >= endIndex) {
            return '0x';
        }
        const sliced = hexBody.slice(startIndex * 2, endIndex * 2);
        return sliced.length === 0 ? '0x' : `0x${sliced}`;
    }
    computeSliceBounds(totalBytes, params) {
        let startValue;
        let endValue;
        if (params.range !== undefined) {
            const trimmedRange = params.range.trim();
            const rangeMatch = trimmedRange.match(/^\[?\s*(-?\d+)?\s*:\s*(-?\d+)?\s*\]?$/);
            if (!rangeMatch) {
                throw new Error('slice-bytes: range must follow the "start:end" format (e.g., "0:4" or ":-1")');
            }
            const [, rawStart, rawEnd] = rangeMatch;
            if (rawStart !== undefined) {
                startValue = this.parseSliceIndex(rawStart, 'range start');
            }
            if (rawEnd !== undefined) {
                endValue = this.parseSliceIndex(rawEnd, 'range end');
            }
        }
        else {
            if (params.start !== undefined) {
                startValue = this.parseSliceIndex(params.start, 'start');
            }
            if (params.end !== undefined) {
                endValue = this.parseSliceIndex(params.end, 'end');
            }
        }
        const startIndex = this.normalizeSliceIndex(startValue ?? 0, totalBytes);
        const endIndex = this.normalizeSliceIndex(endValue ?? totalBytes, totalBytes);
        return { startIndex, endIndex };
    }
    parseSliceIndex(value, label) {
        if (value === undefined || value === null) {
            throw new Error(`slice-bytes: ${label} cannot be null or undefined`);
        }
        const normalizedValue = typeof value === 'string' ? value.trim() : value;
        try {
            const bigIntValue = ethers_1.ethers.toBigInt(normalizedValue);
            const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
            if (bigIntValue > maxSafe || bigIntValue < -maxSafe) {
                throw new Error(`${label} is outside the supported numeric range`);
            }
            return Number(bigIntValue);
        }
        catch (_error) {
            throw new Error(`slice-bytes: ${label} must be an integer or integer-like string`);
        }
    }
    normalizeSliceIndex(index, totalBytes) {
        if (!Number.isFinite(index) || !Number.isInteger(index)) {
            throw new Error('slice-bytes: slice positions must be finite integers');
        }
        let normalized = index;
        if (normalized < 0) {
            normalized = totalBytes + normalized;
        }
        if (normalized < 0) {
            normalized = 0;
        }
        if (normalized > totalBytes) {
            normalized = totalBytes;
        }
        return normalized;
    }
    async resolveArguments(args, context, scope) {
        if (Array.isArray(args)) {
            return Promise.all(args.map(arg => this.resolve(arg, context, scope)));
        }
        if (typeof args === 'object' && args !== null) {
            const resolvedObject = {};
            for (const key in args) {
                if (Object.prototype.hasOwnProperty.call(args, key)) {
                    resolvedObject[key] = await this.resolve(args[key], context, scope);
                }
            }
            return resolvedObject;
        }
        return this.resolve(args, context, scope);
    }
}
exports.ValueResolver = ValueResolver;
//# sourceMappingURL=resolver.js.map