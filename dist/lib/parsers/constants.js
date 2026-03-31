"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseConstants = parseConstants;
exports.extractJobConstants = extractJobConstants;
const yaml_1 = require("yaml");
function parseConstants(yamlContent) {
    let rawObject;
    try {
        rawObject = (0, yaml_1.parse)(yamlContent);
    }
    catch (e) {
        if (e instanceof yaml_1.YAMLParseError) {
            const line = e.linePos?.[0]?.line ? ` at line ${e.linePos[0].line}` : '';
            throw new Error(`Failed to parse constants YAML: ${e.message}${line}.`);
        }
        throw e;
    }
    if (!rawObject || typeof rawObject !== 'object') {
        return null;
    }
    if (rawObject.type !== 'constants') {
        return null;
    }
    if (rawObject.name !== undefined && typeof rawObject.name !== 'string') {
        throw new Error('Invalid constants: "name" must be a string if provided.');
    }
    if (!rawObject.constants || typeof rawObject.constants !== 'object' || Array.isArray(rawObject.constants)) {
        throw new Error('Invalid constants: "constants" field is required and must be an object.');
    }
    const doc = {
        type: 'constants',
        name: rawObject.name,
        constants: rawObject.constants
    };
    return doc;
}
function extractJobConstants(rawJob, jobNameForErrors) {
    if (rawJob.constants === undefined)
        return undefined;
    if (typeof rawJob.constants !== 'object' || Array.isArray(rawJob.constants)) {
        throw new Error(`Invalid job "${jobNameForErrors}": "constants" field must be an object if provided.`);
    }
    return rawJob.constants;
}
//# sourceMappingURL=constants.js.map