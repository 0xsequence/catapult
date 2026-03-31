"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJob = parseJob;
const yaml_1 = require("yaml");
function isCondition(item) {
    if (!item || typeof item !== 'object' || typeof item.type !== 'string') {
        return false;
    }
    if (['contract-exists', 'job-completed'].includes(item.type)) {
        return true;
    }
    if (item.type === 'basic-arithmetic') {
        const op = item.arguments?.operation;
        return typeof op === 'string' && ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'].includes(op);
    }
    return false;
}
function parseJob(yamlContent) {
    let rawObject;
    try {
        rawObject = (0, yaml_1.parse)(yamlContent);
    }
    catch (e) {
        if (e instanceof yaml_1.YAMLParseError) {
            const line = e.linePos?.[0].line ? ` at line ${e.linePos[0].line}` : '';
            throw new Error(`Failed to parse job YAML: ${e.message}${line}.`);
        }
        throw e;
    }
    if (!rawObject || typeof rawObject !== 'object') {
        throw new Error('Invalid job: YAML content must resolve to an object.');
    }
    if (rawObject.type && rawObject.type !== 'job') {
        throw new Error('Invalid job: unexpected type discriminator. Did you mean a template file with type: "template"?');
    }
    if (!rawObject.name || typeof rawObject.name !== 'string') {
        throw new Error('Invalid job: "name" field is required and must be a string.');
    }
    if (!rawObject.version) {
        throw new Error(`Invalid job "${rawObject.name}": "version" field is required.`);
    }
    rawObject.version = String(rawObject.version);
    if (!rawObject.actions || !Array.isArray(rawObject.actions)) {
        throw new Error(`Invalid job "${rawObject.name}": "actions" field is required and must be an array.`);
    }
    for (const action of rawObject.actions) {
        if (!action || typeof action !== 'object') {
            throw new Error(`Invalid job "${rawObject.name}": contains a non-object item in "actions" array.`);
        }
        if (!action.name || typeof action.name !== 'string') {
            throw new Error(`Invalid job "${rawObject.name}": an action is missing the required "name" field.`);
        }
        const hasTemplate = action.template && typeof action.template === 'string';
        const hasType = action.type && typeof action.type === 'string';
        if (!hasTemplate && !hasType) {
            throw new Error(`Invalid job "${rawObject.name}": action "${action.name}" must have either a "template" field (for template actions) or a "type" field (for primitive actions).`);
        }
        if (hasTemplate && hasType) {
            throw new Error(`Invalid job "${rawObject.name}": action "${action.name}" cannot have both "template" and "type" fields. Use only one.`);
        }
        if (!action.arguments || typeof action.arguments !== 'object' || Array.isArray(action.arguments)) {
            throw new Error(`Invalid job "${rawObject.name}": action "${action.name}" is missing the required "arguments" field or it is not an object.`);
        }
        if (action.output !== undefined) {
            const t = typeof action.output;
            const isObject = t === 'object' && action.output !== null && !Array.isArray(action.output);
            if (t !== 'boolean' && !isObject) {
                throw new Error(`Invalid job "${rawObject.name}": action "${action.name}" has an invalid "output" field. It must be either a boolean (true/false) or an object mapping custom outputs.`);
            }
        }
    }
    if (rawObject.deprecated !== undefined && typeof rawObject.deprecated !== 'boolean') {
        throw new Error(`Invalid job "${rawObject.name}": "deprecated" must be a boolean if provided.`);
    }
    if (rawObject.min_evm_version !== undefined && typeof rawObject.min_evm_version !== 'string') {
        throw new Error(`Invalid job "${rawObject.name}": "min_evm_version" must be a string if provided.`);
    }
    if (rawObject.skip_condition !== undefined) {
        if (!Array.isArray(rawObject.skip_condition)) {
            throw new Error(`Invalid job "${rawObject.name}": "skip_condition" must be an array if provided.`);
        }
        for (const condition of rawObject.skip_condition) {
            if (!isCondition(condition)) {
                throw new Error(`Invalid job "${rawObject.name}": "skip_condition" contains an invalid condition entry.`);
            }
        }
    }
    if (rawObject.constants !== undefined) {
        if (typeof rawObject.constants !== 'object' || rawObject.constants === null || Array.isArray(rawObject.constants)) {
            throw new Error(`Invalid job "${rawObject.name}": "constants" field must be an object if provided.`);
        }
    }
    const job = {
        name: rawObject.name,
        version: rawObject.version,
        description: rawObject.description,
        depends_on: rawObject.depends_on,
        actions: rawObject.actions,
        only_networks: rawObject.only_networks,
        skip_networks: rawObject.skip_networks,
        min_evm_version: rawObject.min_evm_version,
        deprecated: rawObject.deprecated === true,
        skip_condition: rawObject.skip_condition,
        constants: rawObject.constants,
    };
    return job;
}
//# sourceMappingURL=job.js.map