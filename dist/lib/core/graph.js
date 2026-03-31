"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyGraph = void 0;
const types_1 = require("../types");
const actions_1 = require("../types/actions");
class DependencyGraph {
    constructor(jobs, templates) {
        this.jobs = jobs;
        this.templates = templates;
        this.graph = new Map();
        this.executionOrder = [];
        this.allJobNames = new Set(this.jobs.keys());
        this.build();
        this.checkForCycles();
        this.executionOrder = this.topologicalSort();
    }
    getExecutionOrder() {
        return this.executionOrder;
    }
    getDependencies(jobName) {
        return this.graph.get(jobName) || new Set();
    }
    build() {
        for (const jobName of this.allJobNames) {
            this.graph.set(jobName, this.findAllDependencies(jobName));
        }
    }
    findAllDependencies(jobName, visited = new Set()) {
        if (visited.has(jobName)) {
            return new Set();
        }
        visited.add(jobName);
        const job = this.jobs.get(jobName);
        if (!job) {
            throw new Error(`Integrity error: Job "${jobName}" not found during graph build.`);
        }
        const directDependencies = new Set();
        job.depends_on?.forEach(dep => directDependencies.add(dep));
        for (const action of job.actions) {
            const templateName = action.template || action.type;
            if (!templateName) {
                throw new Error(`Invalid configuration: Action in job "${jobName}" has no template or type field.`);
            }
            if ((0, actions_1.isPrimitiveActionType)(templateName)) {
                continue;
            }
            const template = this.templates.get(templateName);
            if (!template) {
                throw new Error(`Invalid configuration: Template "${templateName}" used by job "${jobName}" not found.`);
            }
            this.findTemplateSetupDependencies(template).forEach(dep => directDependencies.add(dep));
        }
        const allDependencies = new Set(directDependencies);
        for (const dep of directDependencies) {
            if (!this.allJobNames.has(dep)) {
                throw new Error(`Invalid dependency: Job "${jobName}" depends on "${dep}", which does not exist.`);
            }
            const transitiveDeps = this.findAllDependencies(dep, new Set(visited));
            transitiveDeps.forEach(transDep => allDependencies.add(transDep));
        }
        return allDependencies;
    }
    findTemplateSetupDependencies(template) {
        const dependencies = new Set();
        const setup = template.setup;
        if (!setup)
            return dependencies;
        setup.skip_condition?.forEach(condition => {
            if ((0, types_1.isJobCompletedCondition)(condition)) {
                dependencies.add(condition.arguments.job);
            }
        });
        setup.actions?.forEach(action => {
            if ((0, actions_1.isPrimitiveActionType)(action.type)) {
                return;
            }
            const actionTemplate = this.templates.get(action.type);
            if (actionTemplate) {
                this.findTemplateSetupDependencies(actionTemplate).forEach(dep => dependencies.add(dep));
            }
        });
        return dependencies;
    }
    checkForCycles() {
        for (const [jobName, dependencies] of this.graph.entries()) {
            if (dependencies.has(jobName)) {
                const path = this.findPath(jobName, jobName);
                throw new Error(`Circular dependency detected: ${path.join(' -> ')}`);
            }
        }
    }
    findPath(start, end, visited = new Set()) {
        visited.add(start);
        const job = this.jobs.get(start);
        if (!job)
            return [];
        const directDependencies = new Set(job.depends_on || []);
        for (const action of job.actions) {
            const templateName = action.template || action.type;
            if (!templateName || (0, actions_1.isPrimitiveActionType)(templateName)) {
                continue;
            }
            const template = this.templates.get(templateName);
            this.findTemplateSetupDependencies(template).forEach(dep => directDependencies.add(dep));
        }
        if (directDependencies.has(end)) {
            return [start, end];
        }
        for (const dep of directDependencies) {
            if (!visited.has(dep)) {
                const path = this.findPath(dep, end, visited);
                if (path.length > 0) {
                    return [start, ...path];
                }
            }
        }
        return [];
    }
    topologicalSort() {
        const inDegree = new Map();
        const sorted = [];
        const adjacency = new Map();
        for (const jobName of this.allJobNames) {
            inDegree.set(jobName, 0);
            adjacency.set(jobName, []);
        }
        for (const [jobName, dependencies] of this.graph.entries()) {
            inDegree.set(jobName, dependencies.size);
            for (const dep of dependencies) {
                adjacency.get(dep)?.push(jobName);
            }
        }
        const queue = [];
        for (const [jobName, degree] of inDegree.entries()) {
            if (degree === 0) {
                queue.push(jobName);
            }
        }
        while (queue.length > 0) {
            const current = queue.shift();
            sorted.push(current);
            const dependents = adjacency.get(current) || [];
            for (const dependent of dependents) {
                const newDegree = (inDegree.get(dependent) || 1) - 1;
                inDegree.set(dependent, newDegree);
                if (newDegree === 0) {
                    queue.push(dependent);
                }
            }
        }
        if (sorted.length !== this.allJobNames.size) {
            throw new Error('Topological sort failed. The graph likely has a cycle.');
        }
        return sorted;
    }
}
exports.DependencyGraph = DependencyGraph;
//# sourceMappingURL=graph.js.map