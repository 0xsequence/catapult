"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTemplate = parseTemplate;
const yaml_1 = require("yaml");
function isCondition(item) {
    if (!item || typeof item !== 'object' || typeof item.type !== 'string') {
        return false;
    }
    if (['contract-exists', 'job-completed'].includes(item.type)) {
        return true;
    }
    if (item.type === 'value-empty') {
        return !!(item.arguments && typeof item.arguments === 'object' && 'value' in item.arguments);
    }
    if (item.type === 'basic-arithmetic') {
        if (item.arguments && typeof item.arguments.operation === 'string') {
            const booleanOperations = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'];
            return booleanOperations.includes(item.arguments.operation);
        }
    }
    return false;
}
function parseTemplate(yamlContent) {
    let rawObject;
    try {
        rawObject = (0, yaml_1.parse)(yamlContent);
    }
    catch (e) {
        if (e instanceof yaml_1.YAMLParseError) {
            const line = e.linePos?.[0].line ? ` at line ${e.linePos[0].line}` : '';
            throw new Error(`Failed to parse template YAML: ${e.message}${line}.`);
        }
        throw e;
    }
    if (!rawObject || typeof rawObject !== 'object') {
        throw new Error('Invalid template: YAML content must resolve to an object.');
    }
    if (rawObject.type !== undefined && rawObject.type !== 'template') {
        throw new Error('Invalid template: expected type to be "template" if provided.');
    }
    if (!rawObject.name || typeof rawObject.name !== 'string') {
        throw new Error('Invalid template: "name" field is required and must be a string.');
    }
    if (!rawObject.actions || !Array.isArray(rawObject.actions)) {
        throw new Error(`Invalid template "${rawObject.name}": "actions" field is required and must be an array.`);
    }
    if (rawObject.outputs && (typeof rawObject.outputs !== 'object' || Array.isArray(rawObject.outputs))) {
        throw new Error(`Invalid template "${rawObject.name}": "outputs" field must be an object if provided.`);
    }
    const template = {
        type: 'template',
        name: rawObject.name,
        description: rawObject.description,
        arguments: rawObject.arguments,
        returns: rawObject.returns,
        actions: rawObject.actions,
        skip_condition: rawObject.skip_condition,
    };
    if (rawObject.outputs) {
        template.outputs = rawObject.outputs;
    }
    if (rawObject.setup) {
        if (Array.isArray(rawObject.setup)) {
            const setupActions = [];
            const setupConditions = [];
            for (const item of rawObject.setup) {
                if (isCondition(item)) {
                    setupConditions.push(item);
                }
                else {
                    setupActions.push(item);
                }
            }
            template.setup = {};
            if (setupActions.length > 0) {
                template.setup.actions = setupActions;
            }
            if (setupConditions.length > 0) {
                template.setup.skip_condition = setupConditions;
            }
        }
        else if (typeof rawObject.setup === 'object') {
            template.setup = {
                actions: (rawObject.setup.actions || []),
                skip_condition: (rawObject.setup.skip_condition || []),
            };
        }
        else {
            throw new Error(`Invalid template "${rawObject.name}": "setup" field must be an array or an object if provided.`);
        }
    }
    return template;
}
//# sourceMappingURL=template.js.map