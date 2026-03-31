"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const loader_1 = require("../loader");
const graph_1 = require("../graph");
describe('DependencyGraph', () => {
    let loader;
    beforeAll(async () => {
        const projectRoot = path.resolve(__dirname, '../../../../examples');
        loader = new loader_1.ProjectLoader(projectRoot);
        await loader.load();
    });
    it('should be created without errors for a valid project', () => {
        expect(() => new graph_1.DependencyGraph(loader.jobs, loader.templates)).not.toThrow();
    });
    it('should identify direct dependencies from `depends_on` field', () => {
        const graph = new graph_1.DependencyGraph(loader.jobs, loader.templates);
        const guardsDeps = graph.getDependencies('guards-v1');
        expect(guardsDeps.has('sequence-v1')).toBe(true);
    });
    it('should identify dependencies from a template setup block (`job-completed`)', () => {
        const jobs = new Map();
        const templates = new Map();
        templates.set('template-with-setup', {
            name: 'template-with-setup',
            actions: [],
            setup: { skip_condition: [{ type: 'job-completed', arguments: { job: 'dependency-job' } }] },
        });
        jobs.set('job-A', { name: 'job-A', version: '1', actions: [{ name: 'a1', template: 'template-with-setup', arguments: {} }] });
        jobs.set('dependency-job', { name: 'dependency-job', version: '1', actions: [] });
        const graph = new graph_1.DependencyGraph(jobs, templates);
        const jobADeps = graph.getDependencies('job-A');
        expect(jobADeps.has('dependency-job')).toBe(true);
    });
    it('should identify nested dependencies from templates calling templates in setup', () => {
        const graph = new graph_1.DependencyGraph(loader.jobs, loader.templates);
        const seqV1Deps = graph.getDependencies('sequence-v1');
        expect(seqV1Deps.size).toBe(0);
    });
    it('should correctly identify transitive dependencies', () => {
        const graph = new graph_1.DependencyGraph(loader.jobs, loader.templates);
        const patchDeps = graph.getDependencies('sequence-v1-seq-0001-patch');
        expect(patchDeps.has('guards-v1')).toBe(true);
        expect(patchDeps.has('sequence-v1')).toBe(true);
        expect(patchDeps.size).toBe(2);
    });
    it('should produce a valid topological sort order', () => {
        const graph = new graph_1.DependencyGraph(loader.jobs, loader.templates);
        const order = graph.getExecutionOrder();
        const patchIndex = order.indexOf('sequence-v1-seq-0001-patch');
        const guardsIndex = order.indexOf('guards-v1');
        const seqV1Index = order.indexOf('sequence-v1');
        expect(patchIndex).toBeGreaterThan(guardsIndex);
        expect(patchIndex).toBeGreaterThan(seqV1Index);
        expect(guardsIndex).toBeGreaterThan(seqV1Index);
    });
    describe('Cycle Detection', () => {
        it('should throw an error for a simple (A -> B -> A) cycle', () => {
            const jobs = new Map();
            jobs.set('job-A', { name: 'job-A', version: '1', actions: [], depends_on: ['job-B'] });
            jobs.set('job-B', { name: 'job-B', version: '1', actions: [], depends_on: ['job-A'] });
            expect(() => new graph_1.DependencyGraph(jobs, new Map())).toThrow(/Circular dependency detected: job-A -> job-B -> job-A/);
        });
        it('should throw an error for a longer (A -> B -> C -> A) cycle', () => {
            const jobs = new Map();
            jobs.set('job-A', { name: 'job-A', version: '1', actions: [], depends_on: ['job-B'] });
            jobs.set('job-B', { name: 'job-B', version: '1', actions: [], depends_on: ['job-C'] });
            jobs.set('job-C', { name: 'job-C', version: '1', actions: [], depends_on: ['job-A'] });
            expect(() => new graph_1.DependencyGraph(jobs, new Map())).toThrow(/Circular dependency detected: job-A -> job-B -> job-C -> job-A/);
        });
        it('should throw an error for a self-referencing cycle', () => {
            const jobs = new Map();
            jobs.set('job-A', { name: 'job-A', version: '1', actions: [], depends_on: ['job-A'] });
            expect(() => new graph_1.DependencyGraph(jobs, new Map())).toThrow(/Circular dependency detected: job-A -> job-A/);
        });
    });
    it('should throw an error for a dependency on a non-existent job', () => {
        const jobs = new Map();
        jobs.set('job-A', { name: 'job-A', version: '1', actions: [], depends_on: ['job-non-existent'] });
        expect(() => new graph_1.DependencyGraph(jobs, new Map())).toThrow('Invalid dependency: Job "job-A" depends on "job-non-existent", which does not exist.');
    });
});
//# sourceMappingURL=graph.spec.js.map