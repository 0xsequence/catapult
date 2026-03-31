"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractUsedContractReferences = extractUsedContractReferences;
exports.validateContractReferences = validateContractReferences;
async function extractUsedContractReferences(loader) {
    const usedRefs = [];
    for (const [jobName, job] of loader.jobs.entries()) {
        extractJobActionsContractReferences(job.actions, `job '${jobName}'`, job._path, usedRefs);
    }
    for (const [templateName, template] of loader.templates.entries()) {
        extractActionsContractReferences(template.actions, `template '${templateName}'`, template._path, usedRefs);
        if (template.setup?.actions) {
            extractActionsContractReferences(template.setup.actions, `template '${templateName}' setup`, template._path, usedRefs);
        }
        if (template.outputs) {
            extractValueContractReferences(template.outputs, `template '${templateName}' outputs`, template._path, usedRefs);
        }
    }
    return usedRefs;
}
async function validateContractReferences(loader) {
    const missingRefs = [];
    for (const [jobName, job] of loader.jobs.entries()) {
        validateJobActionsForMissingContracts(job.actions, `job '${jobName}'`, job._path, loader, missingRefs);
    }
    for (const [templateName, template] of loader.templates.entries()) {
        validateActionsForMissingContracts(template.actions, `template '${templateName}'`, template._path, loader, missingRefs);
        if (template.setup?.actions) {
            validateActionsForMissingContracts(template.setup.actions, `template '${templateName}' setup`, template._path, loader, missingRefs);
        }
        if (template.outputs) {
            validateValueForMissingContracts(template.outputs, `template '${templateName}' outputs`, template._path, loader, missingRefs);
        }
    }
    return missingRefs;
}
function extractJobActionsContractReferences(actions, locationPrefix, contextPath, usedRefs) {
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const actionLocation = `${locationPrefix}, action ${i + 1}${action.name ? ` '${action.name}'` : ''}`;
        extractValueContractReferences(action.arguments, actionLocation, contextPath, usedRefs);
    }
}
function extractActionsContractReferences(actions, locationPrefix, contextPath, usedRefs) {
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const actionLocation = `${locationPrefix}, action ${i + 1}${action.name ? ` '${action.name}'` : ''}`;
        extractValueContractReferences(action.arguments, actionLocation, contextPath, usedRefs);
    }
}
function extractValueContractReferences(value, location, contextPath, usedRefs) {
    if (typeof value === 'string') {
        const contractMatch = value.match(/^{{Contract\((.*?)\)(?:\.\w+)?}}$/);
        if (contractMatch) {
            const reference = contractMatch[1].trim();
            usedRefs.push({
                reference,
                location: `${location}, Contract(${reference})`
            });
        }
    }
    else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            extractValueContractReferences(value[i], `${location}[${i}]`, contextPath, usedRefs);
        }
    }
    else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
            extractValueContractReferences(val, `${location}.${key}`, contextPath, usedRefs);
        }
    }
}
function validateJobActionsForMissingContracts(actions, locationPrefix, contextPath, loader, missingRefs) {
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const actionLocation = `${locationPrefix}, action ${i + 1}${action.name ? ` '${action.name}'` : ''}`;
        validateValueForMissingContracts(action.arguments, actionLocation, contextPath, loader, missingRefs);
    }
}
function validateActionsForMissingContracts(actions, locationPrefix, contextPath, loader, missingRefs) {
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const actionLocation = `${locationPrefix}, action ${i + 1}${action.name ? ` '${action.name}'` : ''}`;
        validateValueForMissingContracts(action.arguments, actionLocation, contextPath, loader, missingRefs);
    }
}
function validateValueForMissingContracts(value, location, contextPath, loader, missingRefs) {
    if (typeof value === 'string') {
        const contractMatch = value.match(/^{{Contract\((.*?)\)(?:\.\w+)?}}$/);
        if (contractMatch) {
            const reference = contractMatch[1].trim();
            const contract = loader.contractRepository.lookup(reference, contextPath);
            if (!contract) {
                missingRefs.push({
                    reference,
                    location: `${location}, Contract(${reference})`
                });
            }
        }
    }
    else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            validateValueForMissingContracts(value[i], `${location}[${i}]`, contextPath, loader, missingRefs);
        }
    }
    else if (typeof value === 'object' && value !== null) {
        for (const [key, val] of Object.entries(value)) {
            validateValueForMissingContracts(val, `${location}.${key}`, contextPath, loader, missingRefs);
        }
    }
}
//# sourceMappingURL=contract-references.js.map