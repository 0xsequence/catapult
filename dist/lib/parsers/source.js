"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSourceDocument = parseSourceDocument;
exports.mergeSourceProvenance = mergeSourceProvenance;
const yaml_1 = require("yaml");
const STRING_FIELDS = ['repo', 'ref', 'commit', 'build'];
const BUILD_INFO_FIELDS = new Set([...STRING_FIELDS, 'contracts']);
const CONTRACT_OVERRIDE_FIELDS = new Set(STRING_FIELDS);
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function buildInfoLabel(buildInfoPath) {
    return `build_info[${JSON.stringify(buildInfoPath)}]`;
}
function contractOverrideLabel(buildInfoPath, contractName) {
    return `${buildInfoLabel(buildInfoPath)}.contracts[${JSON.stringify(contractName)}]`;
}
function validateKnownFields(value, label, allowedFields) {
    for (const field of Object.keys(value)) {
        if (!allowedFields.has(field)) {
            throw new Error(`Invalid source: ${label}.${field} is not supported.`);
        }
    }
}
function validateStringFields(value, label, requiredRepo) {
    if (requiredRepo && (typeof value.repo !== 'string' || value.repo.length === 0)) {
        throw new Error(`Invalid source: ${label}.repo field is required and must be a non-empty string.`);
    }
    for (const field of STRING_FIELDS) {
        if (value[field] !== undefined && typeof value[field] !== 'string') {
            throw new Error(`Invalid source: ${label}.${field} must be a string if provided.`);
        }
    }
}
function validateBuildInfoProvenance(buildInfoPath, provenance) {
    if (!isPlainObject(provenance)) {
        throw new Error(`Invalid source: ${buildInfoLabel(buildInfoPath)} must be an object.`);
    }
    const label = buildInfoLabel(buildInfoPath);
    validateKnownFields(provenance, label, BUILD_INFO_FIELDS);
    validateStringFields(provenance, label, true);
    if (provenance.contracts !== undefined) {
        if (!isPlainObject(provenance.contracts)) {
            throw new Error(`Invalid source: ${label}.contracts must be an object if provided.`);
        }
        for (const [contractName, override] of Object.entries(provenance.contracts)) {
            if (!contractName || typeof contractName !== 'string') {
                throw new Error(`Invalid source: ${label}.contracts keys must be non-empty strings.`);
            }
            if (!isPlainObject(override)) {
                throw new Error(`Invalid source: ${contractOverrideLabel(buildInfoPath, contractName)} must be an object.`);
            }
            const overrideLabel = contractOverrideLabel(buildInfoPath, contractName);
            validateKnownFields(override, overrideLabel, CONTRACT_OVERRIDE_FIELDS);
            validateStringFields(override, overrideLabel, false);
        }
    }
    return provenance;
}
function parseSourceDocument(yamlContent) {
    let rawObject;
    try {
        rawObject = (0, yaml_1.parse)(yamlContent);
    }
    catch (e) {
        if (e instanceof yaml_1.YAMLParseError) {
            const line = e.linePos?.[0]?.line ? ` at line ${e.linePos[0].line}` : '';
            throw new Error(`Failed to parse source YAML: ${e.message}${line}.`);
        }
        throw e;
    }
    if (!rawObject || typeof rawObject !== 'object') {
        return null;
    }
    if (rawObject.type !== 'source') {
        return null;
    }
    if (!isPlainObject(rawObject.build_info)) {
        throw new Error('Invalid source: "build_info" field is required and must be an object.');
    }
    const buildInfo = {};
    const warnings = [];
    for (const [buildInfoPath, provenance] of Object.entries(rawObject.build_info)) {
        if (!buildInfoPath || typeof buildInfoPath !== 'string') {
            throw new Error('Invalid source: "build_info" keys must be non-empty strings.');
        }
        try {
            buildInfo[buildInfoPath] = validateBuildInfoProvenance(buildInfoPath, provenance);
        }
        catch (error) {
            warnings.push(error instanceof Error ? error.message : String(error));
        }
    }
    return {
        type: 'source',
        build_info: buildInfo,
        warnings
    };
}
function mergeSourceProvenance(base, override) {
    const { contracts, ...baseFields } = base;
    return {
        ...baseFields,
        ...(override || {})
    };
}
//# sourceMappingURL=source.js.map