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
const fs = __importStar(require("fs/promises"));
const deployer_1 = require("../deployer");
const loader_1 = require("../core/loader");
const graph_1 = require("../core/graph");
const engine_1 = require("../core/engine");
const context_1 = require("../core/context");
jest.mock('fs/promises');
jest.mock('../core/loader');
jest.mock('../core/graph');
jest.mock('../core/engine');
jest.mock('../core/context');
const mockFs = fs;
const MockProjectLoader = loader_1.ProjectLoader;
const MockDependencyGraph = graph_1.DependencyGraph;
const MockExecutionEngine = engine_1.ExecutionEngine;
const MockExecutionContext = context_1.ExecutionContext;
describe('Deployer', () => {
    let deployerOptions;
    let mockNetwork1;
    let mockNetwork2;
    let mockJob1;
    let mockJob2;
    let mockJob3;
    let deprecatedJob;
    let mockTemplate1;
    let mockLoader;
    let mockGraph;
    let mockEngine;
    let mockContext;
    beforeEach(() => {
        jest.clearAllMocks();
        mockNetwork1 = { name: 'mainnet', chainId: 1, rpcUrl: 'https://eth.rpc' };
        mockNetwork2 = { name: 'polygon', chainId: 137, rpcUrl: 'https://polygon.rpc' };
        mockJob1 = {
            name: 'job1',
            version: '1.0.0',
            description: 'First job',
            actions: [
                { name: 'action1', template: 'template1', arguments: {} }
            ]
        };
        mockJob2 = {
            name: 'job2',
            version: '1.0.0',
            description: 'Second job',
            depends_on: ['job1'],
            actions: [
                { name: 'action2', template: 'template1', arguments: {} }
            ]
        };
        mockJob3 = {
            name: 'job3',
            version: '1.0.0',
            description: 'Third job with network filters',
            only_networks: [1],
            actions: [
                { name: 'action3', template: 'template1', arguments: {} }
            ]
        };
        deprecatedJob = {
            name: 'legacy-job',
            version: '0.1.0',
            description: 'Deprecated job',
            deprecated: true,
            actions: [
                { name: 'legacy-action', template: 'template1', arguments: {} }
            ]
        };
        mockTemplate1 = {
            name: 'template1',
            actions: [
                { type: 'send-transaction', arguments: {} }
            ]
        };
        deployerOptions = {
            projectRoot: '/test/project',
            privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            networks: [mockNetwork1, mockNetwork2],
            flatOutput: true
        };
        mockLoader = {
            load: jest.fn(),
            jobs: new Map([
                ['job1', mockJob1],
                ['job2', mockJob2],
                ['job3', mockJob3]
            ]),
            templates: new Map([
                ['template1', mockTemplate1]
            ]),
            contractRepository: {}
        };
        mockGraph = {
            getExecutionOrder: jest.fn().mockReturnValue(['job1', 'job2', 'job3']),
            getDependencies: jest.fn().mockReturnValue(new Set())
        };
        mockEngine = {
            executeJob: jest.fn().mockResolvedValue(undefined),
            getVerificationWarnings: jest.fn().mockReturnValue([])
        };
        mockContext = {
            getOutputs: jest.fn().mockReturnValue(new Map([
                ['action1.hash', '0xhash1'],
                ['action1.receipt', { status: 1 }]
            ])),
            dispose: jest.fn().mockResolvedValue(undefined),
            setOutput: jest.fn(),
            getOutput: jest.fn()
        };
        MockProjectLoader.mockImplementation(() => mockLoader);
        MockDependencyGraph.mockImplementation(() => mockGraph);
        MockExecutionEngine.mockImplementation(() => mockEngine);
        MockExecutionContext.mockImplementation(() => mockContext);
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });
    afterEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });
    describe('constructor', () => {
        it('should create a deployer with valid options', () => {
            const deployer = new deployer_1.Deployer(deployerOptions);
            expect(deployer).toBeInstanceOf(deployer_1.Deployer);
        });
        it('should initialize ProjectLoader with correct project root', () => {
            new deployer_1.Deployer(deployerOptions);
            expect(MockProjectLoader).toHaveBeenCalledWith('/test/project', undefined);
        });
    });
    describe('run', () => {
        describe('happy paths', () => {
            it('should successfully run a simple deployment', async () => {
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockLoader.load).toHaveBeenCalledTimes(1);
                expect(MockDependencyGraph).toHaveBeenCalledWith(mockLoader.jobs, mockLoader.templates);
                expect(mockGraph.getExecutionOrder).toHaveBeenCalledTimes(1);
                expect(MockExecutionEngine).toHaveBeenCalledWith(mockLoader.templates, expect.any(Object));
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(5);
                expect(MockExecutionContext).toHaveBeenCalledTimes(5);
                expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output', { recursive: true });
                expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
            });
            it('should run only specified jobs and their dependencies', async () => {
                mockGraph.getDependencies.mockImplementation((jobName) => {
                    if (jobName === 'job2')
                        return new Set(['job1']);
                    return new Set();
                });
                const options = {
                    ...deployerOptions,
                    runJobs: ['job2']
                };
                const deployer = new deployer_1.Deployer(options);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(4);
                const executedJobs = mockEngine.executeJob.mock.calls.map(call => call[0].name);
                expect(executedJobs).toContain('job1');
                expect(executedJobs).toContain('job2');
                expect(executedJobs).not.toContain('job3');
            });
            it('should run only on specified networks', async () => {
                const options = {
                    ...deployerOptions,
                    runOnNetworks: [1]
                };
                const deployer = new deployer_1.Deployer(options);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(3);
                const usedNetworks = MockExecutionContext.mock.calls.map(call => call[0]);
                expect(usedNetworks).toHaveLength(3);
                usedNetworks.forEach(network => {
                    expect(network.chainId).toBe(1);
                });
            });
            it('should skip jobs based on network filters', async () => {
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                const job3Calls = mockEngine.executeJob.mock.calls.filter(call => call[0].name === 'job3');
                expect(job3Calls).toHaveLength(1);
                const contextCallsForJob3 = MockExecutionContext.mock.calls.filter((_, index) => {
                    const engineCall = mockEngine.executeJob.mock.calls[index];
                    return engineCall && engineCall[0].name === 'job3';
                });
                expect(contextCallsForJob3[0][0].chainId).toBe(1);
            });
            it('should handle jobs with skip_networks filter', async () => {
                const jobWithSkipNetworks = {
                    ...mockJob1,
                    name: 'job-skip-polygon',
                    skip_networks: [137]
                };
                mockLoader.jobs.set('job-skip-polygon', jobWithSkipNetworks);
                mockGraph.getExecutionOrder.mockReturnValue(['job-skip-polygon']);
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(1);
                const usedNetwork = MockExecutionContext.mock.calls[0][0];
                expect(usedNetwork.chainId).toBe(1);
            });
            it('should create correct output files in flat mode', async () => {
                const deployer = new deployer_1.Deployer({ ...deployerOptions, flatOutput: true });
                await deployer.run();
                expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output', { recursive: true });
                expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
                const job1OutputCall = mockFs.writeFile.mock.calls.find(call => call[0] === '/test/project/output/job1.json');
                expect(job1OutputCall).toBeDefined();
                const job1Content = JSON.parse(job1OutputCall[1]);
                expect(job1Content).toMatchObject({
                    jobName: 'job1',
                    jobVersion: '1.0.0',
                    lastRun: expect.any(String),
                    networks: [
                        {
                            status: 'success',
                            chainIds: expect.arrayContaining(['1', '137']),
                            outputs: expect.any(Object)
                        }
                    ]
                });
            });
            it('should mirror jobs directory structure by default', async () => {
                const job1 = mockLoader.jobs.get('job1');
                const job2 = mockLoader.jobs.get('job2');
                const job3 = mockLoader.jobs.get('job3');
                job1._path = '/test/project/jobs/core/job1.yaml';
                job2._path = '/test/project/jobs/patches/job2.yml';
                job3._path = '/test/project/jobs/job3.yaml';
                const deployer = new deployer_1.Deployer({ ...deployerOptions, flatOutput: undefined });
                await deployer.run();
                expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output/core', { recursive: true });
                expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/output/patches', { recursive: true });
                const job1OutputCall = mockFs.writeFile.mock.calls.find(call => call[0] === '/test/project/output/core/job1.json');
                expect(job1OutputCall).toBeDefined();
                const job2OutputCall = mockFs.writeFile.mock.calls.find(call => call[0] === '/test/project/output/patches/job2.json');
                expect(job2OutputCall).toBeDefined();
                const job3OutputCall = mockFs.writeFile.mock.calls.find(call => call[0] === '/test/project/output/job3.json');
                expect(job3OutputCall).toBeDefined();
            });
            it('should handle empty project gracefully', async () => {
                mockLoader.jobs.clear();
                mockLoader.templates.clear();
                mockGraph.getExecutionOrder.mockReturnValue([]);
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockEngine.executeJob).not.toHaveBeenCalled();
                expect(mockFs.writeFile).not.toHaveBeenCalled();
            });
            it('should filter outputs based on action output flags', async () => {
                const jobWithOutputFlags = {
                    name: 'job-with-output-flags',
                    version: '1.0.0',
                    description: 'Job with output filtering',
                    actions: [
                        { name: 'deploy-action', template: 'template1', arguments: {}, output: true },
                        { name: 'verify-action', template: 'template1', arguments: {}, output: false },
                        { name: 'other-action', template: 'template1', arguments: {} }
                    ]
                };
                mockLoader.jobs.clear();
                mockLoader.jobs.set('job-with-output-flags', jobWithOutputFlags);
                mockGraph.getExecutionOrder.mockReturnValue(['job-with-output-flags']);
                mockContext.getOutputs.mockReturnValue(new Map([
                    ['deploy-action.address', '0xdeployaddress'],
                    ['deploy-action.hash', '0xdeployhash'],
                    ['verify-action.guid', 'verification-guid'],
                    ['other-action.result', 'some-result']
                ]));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
                const outputCall = mockFs.writeFile.mock.calls[0];
                expect(outputCall[0]).toBe('/test/project/output/job-with-output-flags.json');
                const outputContent = JSON.parse(outputCall[1]);
                expect(outputContent.networks).toHaveLength(1);
                expect(outputContent.networks[0].status).toBe('success');
                expect(outputContent.networks[0].outputs).toEqual({
                    'deploy-action.address': '0xdeployaddress',
                    'deploy-action.hash': '0xdeployhash'
                });
            });
            it('should include all outputs when no actions have output: true (backward compatibility)', async () => {
                const jobWithoutOutputFlags = {
                    name: 'job-without-output-flags',
                    version: '1.0.0',
                    description: 'Job without output flags',
                    actions: [
                        { name: 'action1', template: 'template1', arguments: {} },
                        { name: 'action2', template: 'template1', arguments: {}, output: false }
                    ]
                };
                mockLoader.jobs.clear();
                mockLoader.jobs.set('job-without-output-flags', jobWithoutOutputFlags);
                mockGraph.getExecutionOrder.mockReturnValue(['job-without-output-flags']);
                mockContext.getOutputs.mockReturnValue(new Map([
                    ['action1.result', 'result1'],
                    ['action2.result', 'result2']
                ]));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
                const outputCall = mockFs.writeFile.mock.calls[0];
                const outputContent = JSON.parse(outputCall[1]);
                expect(outputContent.networks[0].outputs).toEqual({
                    'action1.result': 'result1',
                    'action2.result': 'result2'
                });
            });
            it('should filter outputs correctly when multiple actions have output: true', async () => {
                const jobWithMultipleOutputs = {
                    name: 'job-multiple-outputs',
                    version: '1.0.0',
                    description: 'Job with multiple output actions',
                    actions: [
                        { name: 'deploy1', template: 'template1', arguments: {}, output: true },
                        { name: 'deploy2', template: 'template1', arguments: {}, output: true },
                        { name: 'verify1', template: 'template1', arguments: {}, output: false },
                        { name: 'verify2', template: 'template1', arguments: {}, output: false }
                    ]
                };
                mockLoader.jobs.clear();
                mockLoader.jobs.set('job-multiple-outputs', jobWithMultipleOutputs);
                mockGraph.getExecutionOrder.mockReturnValue(['job-multiple-outputs']);
                mockContext.getOutputs.mockReturnValue(new Map([
                    ['deploy1.address', '0xdeploy1'],
                    ['deploy2.address', '0xdeploy2'],
                    ['verify1.guid', 'verify1-guid'],
                    ['verify2.guid', 'verify2-guid']
                ]));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                const outputCall = mockFs.writeFile.mock.calls[0];
                const outputContent = JSON.parse(outputCall[1]);
                expect(outputContent.networks[0].outputs).toEqual({
                    'deploy1.address': '0xdeploy1',
                    'deploy2.address': '0xdeploy2'
                });
            });
        });
        describe('error handling', () => {
            it('should throw when project loading fails', async () => {
                mockLoader.load.mockRejectedValue(new Error('Failed to load project'));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('Failed to load project');
            });
            it('should throw when dependency graph creation fails', async () => {
                MockDependencyGraph.mockImplementation(() => {
                    throw new Error('Circular dependency detected');
                });
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('Circular dependency detected');
            });
            it('should capture job execution failures and then throw', async () => {
                mockEngine.executeJob.mockRejectedValue(new Error('Transaction failed'));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
                expect(mockFs.writeFile).toHaveBeenCalled();
                const writeFileCalls = mockFs.writeFile.mock.calls;
                const outputFile = writeFileCalls[0];
                const outputContent = JSON.parse(outputFile[1]);
                const errorEntries = outputContent.networks.filter((entry) => entry.status === 'error');
                expect(errorEntries.length).toBeGreaterThan(0);
                expect(errorEntries[0].error).toBe('Transaction failed');
            });
            it('should throw when output directory creation fails', async () => {
                mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('Permission denied');
            });
            it('should throw when output file writing fails', async () => {
                mockFs.writeFile.mockRejectedValue(new Error('Disk full'));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('Disk full');
            });
            it('should handle execution context creation failure and then throw', async () => {
                MockExecutionContext.mockImplementation(() => {
                    throw new Error('Invalid private key');
                });
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
                const writeFileCalls = mockFs.writeFile.mock.calls;
                const outputFile = writeFileCalls[0];
                const outputContent = JSON.parse(outputFile[1]);
                const errorEntries = outputContent.networks.filter((entry) => entry.status === 'error');
                expect(errorEntries.length).toBeGreaterThan(0);
                expect(errorEntries[0].error).toBe('Invalid private key');
            });
        });
        describe('edge cases and weird scenarios', () => {
            it('should handle job with only_networks that includes non-existent network', async () => {
                const weirdJob = {
                    ...mockJob1,
                    name: 'weird-job',
                    only_networks: [999]
                };
                mockLoader.jobs.clear();
                mockLoader.jobs.set('weird-job', weirdJob);
                mockGraph.getExecutionOrder.mockReturnValue(['weird-job']);
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockEngine.executeJob).not.toHaveBeenCalled();
            });
            it('should handle job with skip_networks that includes all networks', async () => {
                const weirdJob = {
                    ...mockJob1,
                    name: 'weird-job',
                    skip_networks: [1, 137]
                };
                mockLoader.jobs.clear();
                mockLoader.jobs.set('weird-job', weirdJob);
                mockGraph.getExecutionOrder.mockReturnValue(['weird-job']);
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockEngine.executeJob).not.toHaveBeenCalled();
            });
            it('should handle runOnNetworks with non-existent chain IDs', async () => {
                const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
                const options = {
                    ...deployerOptions,
                    runOnNetworks: [1, 999, 888]
                };
                const deployer = new deployer_1.Deployer(options);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(3);
            });
            it('should handle runJobs with non-existent job names', async () => {
                const options = {
                    ...deployerOptions,
                    runJobs: ['non-existent-job']
                };
                const deployer = new deployer_1.Deployer(options);
                await expect(deployer.run()).rejects.toThrow('Specified job "non-existent-job" not found in project.');
            });
            it('should handle execution context without getOutputs method and then throw', async () => {
                const brokenContext = {};
                MockExecutionContext.mockImplementation(() => brokenContext);
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
                const writeFileCalls = mockFs.writeFile.mock.calls;
                const outputFile = writeFileCalls[0];
                const outputContent = JSON.parse(outputFile[1]);
                const errorEntries = outputContent.networks.filter((entry) => entry.status === 'error');
                expect(errorEntries.length).toBeGreaterThan(0);
            });
            it('should handle empty networks array', async () => {
                const options = {
                    ...deployerOptions,
                    networks: []
                };
                const deployer = new deployer_1.Deployer(options);
                await deployer.run();
                expect(mockEngine.executeJob).not.toHaveBeenCalled();
                expect(mockFs.writeFile).not.toHaveBeenCalled();
            });
            it('should handle empty runJobs array', async () => {
                const options = {
                    ...deployerOptions,
                    runJobs: []
                };
                const deployer = new deployer_1.Deployer(options);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(5);
            });
            it('should handle empty runOnNetworks array', async () => {
                const options = {
                    ...deployerOptions,
                    runOnNetworks: []
                };
                const deployer = new deployer_1.Deployer(options);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(5);
            });
            it('should handle job with both only_networks and skip_networks', async () => {
                const conflictedJob = {
                    ...mockJob1,
                    name: 'conflicted-job',
                    only_networks: [1, 137],
                    skip_networks: [137]
                };
                mockLoader.jobs.clear();
                mockLoader.jobs.set('conflicted-job', conflictedJob);
                mockGraph.getExecutionOrder.mockReturnValue(['conflicted-job']);
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(2);
                const usedNetworks = MockExecutionContext.mock.calls.map(call => call[0].chainId);
                expect(usedNetworks).toEqual(expect.arrayContaining([1, 137]));
            });
            it('should write output files even when all executions fail and then throw', async () => {
                mockEngine.executeJob.mockImplementation(() => {
                    throw new Error('Execution failed');
                });
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
                expect(mockFs.writeFile).toHaveBeenCalled();
                const writeFileCalls = mockFs.writeFile.mock.calls;
                const outputFile = writeFileCalls[0];
                const outputContent = JSON.parse(outputFile[1]);
                const errorEntries = outputContent.networks.filter((entry) => entry.status === 'error');
                expect(errorEntries.length).toBeGreaterThan(0);
                const successEntries = outputContent.networks.filter((entry) => entry.status === 'success');
                expect(successEntries.length).toBe(0);
            });
            it('should handle very long execution order', async () => {
                const manyJobs = Array.from({ length: 100 }, (_, i) => `job${i}`);
                mockGraph.getExecutionOrder.mockReturnValue(manyJobs);
                for (let i = 0; i < 100; i++) {
                    mockLoader.jobs.set(`job${i}`, {
                        ...mockJob1,
                        name: `job${i}`
                    });
                }
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(200);
                expect(mockFs.writeFile).toHaveBeenCalledTimes(100);
            });
        });
        describe('private method testing', () => {
            let deployer;
            beforeEach(() => {
                deployer = new deployer_1.Deployer(deployerOptions);
            });
            describe('getJobExecutionPlan', () => {
                it('should return full order when no runJobs specified', () => {
                    const fullOrder = ['job1', 'job2', 'job3'];
                    const plan = deployer.getJobExecutionPlan(fullOrder);
                    expect(plan).toEqual(fullOrder);
                });
                it('should filter and include dependencies', async () => {
                    const options = {
                        ...deployerOptions,
                        runJobs: ['job2']
                    };
                    const deployer = new deployer_1.Deployer(options);
                    await mockLoader.load();
                    deployer.graph = mockGraph;
                    mockGraph.getDependencies.mockReturnValueOnce(new Set(['job1']));
                    const fullOrder = ['job1', 'job2', 'job3'];
                    const plan = deployer.getJobExecutionPlan(fullOrder);
                    expect(plan).toEqual(['job1', 'job2']);
                });
                it('should include deprecated dependencies when no runJobs specified', () => {
                    ;
                    mockLoader.jobs.set('legacy-job', deprecatedJob);
                    const fullOrder = ['legacy-job', 'job1', 'job2', 'job3'];
                    mockGraph.getDependencies.mockImplementation((jobName) => {
                        if (jobName === 'job2')
                            return new Set(['job1', 'legacy-job']);
                        return new Set();
                    });
                    deployer.graph = mockGraph;
                    const plan = deployer.getJobExecutionPlan(fullOrder);
                    expect(plan).toEqual(['legacy-job', 'job1', 'job2', 'job3']);
                });
                it('should keep deprecated dependencies when specific jobs are requested', async () => {
                    ;
                    mockLoader.jobs.set('legacy-job', deprecatedJob);
                    const options = {
                        ...deployerOptions,
                        runJobs: ['job2']
                    };
                    const depDeployer = new deployer_1.Deployer(options);
                    depDeployer.graph = mockGraph;
                    mockGraph.getDependencies.mockImplementation((jobName) => {
                        if (jobName === 'job2')
                            return new Set(['job1', 'legacy-job']);
                        return new Set();
                    });
                    const fullOrder = ['legacy-job', 'job1', 'job2', 'job3'];
                    const plan = depDeployer.getJobExecutionPlan(fullOrder);
                    expect(plan).toEqual(['legacy-job', 'job1', 'job2']);
                });
                it('should expand wildcard patterns in runJobs and preserve execution order', async () => {
                    ;
                    mockLoader.jobs.set('job10', { ...mockJob1, name: 'job10' });
                    mockLoader.jobs.set('another', { ...mockJob1, name: 'another' });
                    const fullOrder = ['another', 'job1', 'job2', 'job3', 'job10'];
                    mockGraph.getExecutionOrder.mockReturnValue(fullOrder);
                    const options = {
                        ...deployerOptions,
                        runJobs: ['job*']
                    };
                    const dep = new deployer_1.Deployer(options);
                    dep.loader = mockLoader;
                    dep.graph = mockGraph;
                    const plan = dep.getJobExecutionPlan(fullOrder);
                    expect(plan).toEqual(['job1', 'job2', 'job3', 'job10']);
                });
                it('should support mixed exact names and patterns', async () => {
                    const fullOrder = ['job1', 'job2', 'job3'];
                    mockGraph.getExecutionOrder.mockReturnValue(fullOrder);
                    const options = {
                        ...deployerOptions,
                        runJobs: ['job1', 'job?']
                    };
                    const dep = new deployer_1.Deployer(options);
                    dep.loader = mockLoader;
                    dep.graph = mockGraph;
                    const plan = dep.getJobExecutionPlan(fullOrder);
                    expect(plan).toEqual(['job1', 'job2', 'job3']);
                });
                it('should throw when a pattern matches no jobs', async () => {
                    const fullOrder = ['job1', 'job2', 'job3'];
                    mockGraph.getExecutionOrder.mockReturnValue(fullOrder);
                    const options = {
                        ...deployerOptions,
                        runJobs: ['does-not-exist*']
                    };
                    const dep = new deployer_1.Deployer(options);
                    dep.loader = mockLoader;
                    dep.graph = mockGraph;
                    expect(() => dep.getJobExecutionPlan(fullOrder)).toThrow('Job pattern "does-not-exist*" did not match any jobs in project.');
                });
                it('should match names containing slashes with patterns', async () => {
                    const jA = { ...mockJob1, name: 'sequence_v3/beta_4' };
                    const jB = { ...mockJob1, name: 'sequence_v3/rc_1' };
                    mockLoader.jobs.set(jA.name, jA);
                    mockLoader.jobs.set(jB.name, jB);
                    const fullOrder = ['job1', jA.name, jB.name, 'job2'];
                    mockGraph.getExecutionOrder.mockReturnValue(fullOrder);
                    const options = {
                        ...deployerOptions,
                        runJobs: ['sequence_v3/*']
                    };
                    const dep = new deployer_1.Deployer(options);
                    dep.loader = mockLoader;
                    dep.graph = mockGraph;
                    const plan = dep.getJobExecutionPlan(fullOrder);
                    expect(plan).toEqual(['sequence_v3/beta_4', 'sequence_v3/rc_1']);
                });
            });
            describe('getTargetNetworks', () => {
                it('should return all networks when no runOnNetworks specified', () => {
                    const networks = deployer.getTargetNetworks();
                    expect(networks).toEqual([mockNetwork1, mockNetwork2]);
                });
                it('should filter networks by chain ID', () => {
                    const options = {
                        ...deployerOptions,
                        runOnNetworks: [1]
                    };
                    const deployer = new deployer_1.Deployer(options);
                    const networks = deployer.getTargetNetworks();
                    expect(networks).toEqual([mockNetwork1]);
                });
            });
            describe('shouldSkipJobOnNetwork', () => {
                it('should return false for job with no network filters', () => {
                    const result = deployer.shouldSkipJobOnNetwork(mockJob1, mockNetwork1);
                    expect(result).toBe(false);
                });
                it('should return true when network not in only_networks', () => {
                    const result = deployer.shouldSkipJobOnNetwork(mockJob3, mockNetwork2);
                    expect(result).toBe(true);
                });
                it('should return false when network is in only_networks', () => {
                    const result = deployer.shouldSkipJobOnNetwork(mockJob3, mockNetwork1);
                    expect(result).toBe(false);
                });
                it('should return true when network is in skip_networks', () => {
                    const jobWithSkip = {
                        ...mockJob1,
                        skip_networks: [1]
                    };
                    const result = deployer.shouldSkipJobOnNetwork(jobWithSkip, mockNetwork1);
                    expect(result).toBe(true);
                });
            });
        });
        describe('integration-like scenarios', () => {
            it('should handle complex dependency chain with network filtering', async () => {
                const job4 = {
                    name: 'job4',
                    version: '1.0.0',
                    depends_on: ['job3'],
                    skip_networks: [137],
                    actions: [{ name: 'action4', template: 'template1', arguments: {} }]
                };
                mockLoader.jobs.set('job4', job4);
                mockGraph.getExecutionOrder.mockReturnValue(['job1', 'job2', 'job3', 'job4']);
                mockGraph.getDependencies
                    .mockReturnValueOnce(new Set())
                    .mockReturnValueOnce(new Set(['job1']))
                    .mockReturnValueOnce(new Set(['job1', 'job2']))
                    .mockReturnValueOnce(new Set(['job1', 'job2', 'job3']));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                expect(mockEngine.executeJob).toHaveBeenCalledTimes(6);
                const contextCalls = MockExecutionContext.mock.calls;
                const mainnetCalls = contextCalls.filter(call => call[0].chainId === 1);
                const polygonCalls = contextCalls.filter(call => call[0].chainId === 137);
                expect(mainnetCalls).toHaveLength(4);
                expect(polygonCalls).toHaveLength(2);
            });
            it('should handle partial failure scenario', async () => {
                let callCount = 0;
                mockEngine.executeJob.mockImplementation((job, context) => {
                    const currentCall = MockExecutionContext.mock.calls[callCount];
                    const network = currentCall ? currentCall[0] : null;
                    callCount++;
                    if (job.name === 'job2' && network && network.chainId === 137) {
                        throw new Error('Polygon execution failed');
                    }
                    return Promise.resolve();
                });
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
                const writeFileCalls = mockFs.writeFile.mock.calls;
                const job2Output = writeFileCalls.find(call => String(call[0]).includes('job2.json'));
                if (job2Output) {
                    const job2Content = JSON.parse(job2Output[1]);
                    const errorEntries = job2Content.networks.filter((entry) => entry.status === 'error');
                    expect(errorEntries.some((entry) => entry.chainId === '137' && entry.error === 'Polygon execution failed')).toBe(true);
                }
            });
            it('should handle context output aggregation correctly', async () => {
                MockExecutionContext.mockImplementation((network) => ({
                    network,
                    getOutputs: jest.fn().mockReturnValue(new Map([
                        [`action.hash`, `0xhash-${network.chainId}`],
                        [`action.receipt`, { status: 1, blockNumber: network.chainId * 100 }]
                    ])),
                    dispose: jest.fn().mockResolvedValue(undefined),
                    setOutput: jest.fn(),
                    getOutput: jest.fn()
                }));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                const writeFileCalls = mockFs.writeFile.mock.calls;
                const job1Output = writeFileCalls.find(call => call[0] === '/test/project/output/job1.json');
                const job1Content = JSON.parse(job1Output[1]);
                expect(job1Content.networks).toHaveLength(2);
                const network1Entry = job1Content.networks.find((entry) => entry.chainIds && entry.chainIds.includes('1'));
                const network137Entry = job1Content.networks.find((entry) => entry.chainIds && entry.chainIds.includes('137'));
                expect(network1Entry.outputs['action.hash']).toBe('0xhash-1');
                expect(network137Entry.outputs['action.hash']).toBe('0xhash-137');
            });
            it('should group networks with identical outputs together', async () => {
                MockExecutionContext.mockImplementation(() => ({
                    getOutputs: jest.fn().mockReturnValue(new Map([
                        [`contract.address`, `0x1234567890123456789012345678901234567890`],
                        [`contract.txHash`, `0xabcdef1234567890abcdef1234567890abcdef12`]
                    ])),
                    dispose: jest.fn().mockResolvedValue(undefined),
                    setOutput: jest.fn(),
                    getOutput: jest.fn()
                }));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await deployer.run();
                const writeFileCalls = mockFs.writeFile.mock.calls;
                const job1Output = writeFileCalls.find(call => call[0] === '/test/project/output/job1.json');
                const job1Content = JSON.parse(job1Output[1]);
                expect(job1Content.networks).toHaveLength(1);
                expect(job1Content.networks[0].status).toBe('success');
                expect(job1Content.networks[0].chainIds).toEqual(['1', '137']);
                expect(job1Content.networks[0].outputs['contract.address']).toBe('0x1234567890123456789012345678901234567890');
            });
            it('should handle partial failure scenario with proper grouping', async () => {
                let callCount = 0;
                mockEngine.executeJob.mockImplementation((job, context) => {
                    const currentCall = MockExecutionContext.mock.calls[callCount];
                    const network = currentCall ? currentCall[0] : null;
                    callCount++;
                    if (job.name === 'job1' && network && network.chainId === 137) {
                        throw new Error('Polygon execution failed');
                    }
                    return Promise.resolve();
                });
                MockExecutionContext.mockImplementation((network) => ({
                    network,
                    getOutputs: jest.fn().mockReturnValue(new Map([
                        [`contract.address`, `0x1234567890123456789012345678901234567890`]
                    ])),
                    dispose: jest.fn().mockResolvedValue(undefined),
                    setOutput: jest.fn(),
                    getOutput: jest.fn()
                }));
                const deployer = new deployer_1.Deployer(deployerOptions);
                await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
                const writeFileCalls = mockFs.writeFile.mock.calls;
                const job1Output = writeFileCalls.find(call => call[0] === '/test/project/output/job1.json');
                const job1Content = JSON.parse(job1Output[1]);
                expect(job1Content.networks).toHaveLength(2);
                const successEntry = job1Content.networks.find((entry) => entry.status === 'success');
                const errorEntry = job1Content.networks.find((entry) => entry.status === 'error');
                expect(successEntry).toBeDefined();
                expect(successEntry.chainIds).toEqual(['1']);
                expect(successEntry.outputs['contract.address']).toBe('0x1234567890123456789012345678901234567890');
                expect(errorEntry).toBeDefined();
                expect(errorEntry.chainId).toBe('137');
                expect(errorEntry.error).toBe('Polygon execution failed');
            });
        });
    });
    describe('fail-early functionality', () => {
        beforeEach(() => {
            mockEngine.executeJob.mockClear();
        });
        it('should stop execution immediately when failEarly is true', async () => {
            const options = {
                ...deployerOptions,
                runJobs: ['job1'],
                failEarly: true
            };
            mockEngine.executeJob.mockRejectedValueOnce(new Error('First job failed'));
            const deployer = new deployer_1.Deployer(options);
            await expect(deployer.run()).rejects.toThrow('First job failed');
            expect(mockEngine.executeJob).toHaveBeenCalledTimes(1);
        });
        it('should continue through all jobs/networks when failEarly is false', async () => {
            const options = {
                ...deployerOptions,
                runJobs: ['job1'],
                failEarly: false
            };
            mockEngine.executeJob.mockRejectedValueOnce(new Error('First job failed'));
            mockEngine.executeJob.mockResolvedValue(undefined);
            const deployer = new deployer_1.Deployer(options);
            await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
            expect(mockEngine.executeJob).toHaveBeenCalledTimes(2);
        });
        it('should default to failEarly: false when option is not provided', async () => {
            const options = {
                ...deployerOptions,
                runJobs: ['job1']
            };
            mockEngine.executeJob.mockRejectedValueOnce(new Error('First job failed'));
            mockEngine.executeJob.mockResolvedValue(undefined);
            const deployer = new deployer_1.Deployer(options);
            await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
            expect(mockEngine.executeJob).toHaveBeenCalledTimes(2);
        });
        it('should not throw when all jobs succeed, regardless of failEarly setting', async () => {
            const options = {
                ...deployerOptions,
                runJobs: ['job1'],
                failEarly: true
            };
            mockEngine.executeJob.mockResolvedValue(undefined);
            const deployer = new deployer_1.Deployer(options);
            await expect(deployer.run()).resolves.not.toThrow();
            expect(mockEngine.executeJob).toHaveBeenCalledTimes(2);
        });
    });
    describe('ignore verify errors feature', () => {
        it('should pass ignoreVerifyErrors option to ExecutionEngine', async () => {
            const optionsWithIgnoreVerifyErrors = {
                ...deployerOptions,
                ignoreVerifyErrors: true
            };
            const deployer = new deployer_1.Deployer(optionsWithIgnoreVerifyErrors);
            await deployer.run();
            expect(MockExecutionEngine).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                ignoreVerifyErrors: true
            }));
        });
        it('should emit verification warnings report when ignoreVerifyErrors is enabled', async () => {
            const mockWarnings = [
                {
                    actionName: 'verify-test',
                    address: '0x1234567890123456789012345678901234567890',
                    contractName: 'TestContract',
                    platform: 'etherscan_v2',
                    error: 'Failed to verify contract',
                    networkName: 'mainnet'
                }
            ];
            mockEngine.getVerificationWarnings = jest.fn().mockReturnValue(mockWarnings);
            const optionsWithIgnoreVerifyErrors = {
                ...deployerOptions,
                ignoreVerifyErrors: true
            };
            const deployer = new deployer_1.Deployer(optionsWithIgnoreVerifyErrors);
            const mockEmitEvent = jest.fn();
            deployer.events = { emitEvent: mockEmitEvent };
            await deployer.run();
            expect(mockEmitEvent).toHaveBeenCalledWith({
                type: 'verification_warnings_report',
                level: 'warn',
                data: {
                    totalWarnings: 1,
                    warnings: mockWarnings
                }
            });
        });
        it('should not emit verification warnings report when ignoreVerifyErrors is disabled', async () => {
            const optionsWithoutIgnoreVerifyErrors = {
                ...deployerOptions,
                ignoreVerifyErrors: false
            };
            const deployer = new deployer_1.Deployer(optionsWithoutIgnoreVerifyErrors);
            const mockEmitEvent = jest.fn();
            deployer.events = { emitEvent: mockEmitEvent };
            await deployer.run();
            expect(mockEmitEvent).not.toHaveBeenCalledWith(expect.objectContaining({
                type: 'verification_warnings_report'
            }));
        });
        it('should not emit verification warnings report when there are no warnings', async () => {
            mockEngine.getVerificationWarnings = jest.fn().mockReturnValue([]);
            const optionsWithIgnoreVerifyErrors = {
                ...deployerOptions,
                ignoreVerifyErrors: true
            };
            const deployer = new deployer_1.Deployer(optionsWithIgnoreVerifyErrors);
            const mockEmitEvent = jest.fn();
            deployer.events = { emitEvent: mockEmitEvent };
            await deployer.run();
            expect(mockEmitEvent).not.toHaveBeenCalledWith(expect.objectContaining({
                type: 'verification_warnings_report'
            }));
        });
    });
    describe('job dependency failure handling', () => {
        const TEST_BYTECODES = {
            SIMPLE_CONTRACT: '0x6080604052348015600e575f5ffd5b5060c180601a5f395ff3fe6080604052348015600e575f5ffd5b50600436106030575f3560e01c806390c52443146034578063d09de08a14604d575b5f5ffd5b603b5f5481565b60405190815260200160405180910390f35b60536055565b005b5f805490806061836068565b9190505550565b5f60018201608457634e487b7160e01b5f52601160045260245ffd5b506001019056fea264697066735822122061c8cc43c72d6b23b16f7a7337dd15b93d71eb94a9d5247911e39f486e1f94f964736f6c634300081e0033',
            BROKEN_BYTECODE: '0xff'
        };
        it('should fail job B when job A fails due to dependency failure', async () => {
            const jobA = {
                name: 'job-a',
                version: '1',
                description: 'Deploy a contract with broken bytecode (will fail)',
                actions: [
                    {
                        name: 'failing-deploy',
                        type: 'create-contract',
                        arguments: {
                            bytecode: TEST_BYTECODES.BROKEN_BYTECODE,
                            value: '0'
                        },
                        output: true
                    }
                ]
            };
            const jobB = {
                name: 'job-b',
                version: '1',
                description: 'Use output from failed job A',
                depends_on: ['job-a'],
                actions: [
                    {
                        name: 'use-failed-output',
                        type: 'send-transaction',
                        arguments: {
                            to: '{{job-a.failing-deploy.address}}',
                            data: '0x',
                            value: '0'
                        }
                    }
                ]
            };
            const mockJobs = new Map();
            mockJobs.set('job-a', jobA);
            mockJobs.set('job-b', jobB);
            const mockTemplates = new Map();
            MockProjectLoader.mockImplementation(() => ({
                load: jest.fn().mockResolvedValue(undefined),
                jobs: mockJobs,
                templates: mockTemplates
            }));
            MockDependencyGraph.mockImplementation(() => ({
                getExecutionOrder: jest.fn().mockReturnValue(['job-a', 'job-b']),
                getDependencies: jest.fn().mockReturnValue(new Set())
            }));
            MockExecutionEngine.mockImplementation(() => ({
                executeJob: jest.fn().mockImplementation(async (job) => {
                    if (job.name === 'job-a') {
                        throw new Error('Contract deployment failed: invalid bytecode');
                    }
                })
            }));
            MockExecutionContext.mockImplementation(() => ({
                dispose: jest.fn().mockResolvedValue(undefined),
                getNetwork: jest.fn().mockReturnValue(mockNetwork1)
            }));
            const deployer = new deployer_1.Deployer(deployerOptions);
            await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
            const results = deployer.results;
            const jobAResult = results.get('job-a');
            expect(jobAResult).toBeDefined();
            expect(jobAResult.outputs.get(mockNetwork1.chainId).status).toBe('error');
            const jobBResult = results.get('job-b');
            expect(jobBResult).toBeDefined();
            const jobBError = jobBResult.outputs.get(mockNetwork1.chainId);
            expect(jobBError.status).toBe('error');
            expect(jobBError.data).toContain('depends on "job-a", but "job-a" failed');
        });
        it('should fail job B when referencing non-existent job outputs', async () => {
            const jobB = {
                name: 'job-b',
                version: '1',
                description: 'Reference non-existent job outputs',
                actions: [
                    {
                        name: 'use-output-step',
                        type: 'send-transaction',
                        arguments: {
                            to: '{{non-existent-job.deploy-step.address}}',
                            data: '0x',
                            value: '0'
                        }
                    }
                ]
            };
            const mockJobs = new Map();
            mockJobs.set('job-b', jobB);
            const mockTemplates = new Map();
            MockProjectLoader.mockImplementation(() => ({
                load: jest.fn().mockResolvedValue(undefined),
                jobs: mockJobs,
                templates: mockTemplates
            }));
            MockDependencyGraph.mockImplementation(() => ({
                getExecutionOrder: jest.fn().mockReturnValue(['job-b']),
                getDependencies: jest.fn().mockReturnValue(new Set())
            }));
            MockExecutionEngine.mockImplementation(() => ({
                executeJob: jest.fn().mockRejectedValue(new Error('Output for key "non-existent-job.deploy-step.address" not found in context'))
            }));
            MockExecutionContext.mockImplementation(() => ({
                dispose: jest.fn().mockResolvedValue(undefined),
                getNetwork: jest.fn().mockReturnValue(mockNetwork1)
            }));
            const deployer = new deployer_1.Deployer(deployerOptions);
            await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
            const results = deployer.results;
            const jobBResult = results.get('job-b');
            expect(jobBResult).toBeDefined();
            expect(jobBResult.outputs.get(mockNetwork1.chainId).status).toBe('error');
        });
        it('should handle job B with no dependency on job A but references job A outputs', async () => {
            const jobA = {
                name: 'job-a',
                version: '1',
                description: 'Deploy a contract successfully',
                actions: [
                    {
                        name: 'deploy-step',
                        type: 'create-contract',
                        arguments: {
                            bytecode: TEST_BYTECODES.SIMPLE_CONTRACT,
                            value: '0'
                        },
                        output: true
                    }
                ]
            };
            const jobB = {
                name: 'job-b',
                version: '1',
                description: 'Reference job A outputs without explicit dependency',
                actions: [
                    {
                        name: 'use-output-step',
                        type: 'send-transaction',
                        arguments: {
                            to: '{{job-a.deploy-step.address}}',
                            data: '0x',
                            value: '0'
                        }
                    }
                ]
            };
            const mockJobs = new Map();
            mockJobs.set('job-a', jobA);
            mockJobs.set('job-b', jobB);
            const mockTemplates = new Map();
            MockProjectLoader.mockImplementation(() => ({
                load: jest.fn().mockResolvedValue(undefined),
                jobs: mockJobs,
                templates: mockTemplates
            }));
            MockDependencyGraph.mockImplementation(() => ({
                getExecutionOrder: jest.fn().mockReturnValue(['job-a', 'job-b']),
                getDependencies: jest.fn().mockReturnValue(new Set())
            }));
            MockExecutionEngine.mockImplementation(() => ({
                executeJob: jest.fn().mockImplementation(async (job) => {
                    if (job.name === 'job-a') {
                        return Promise.resolve();
                    }
                    else if (job.name === 'job-b') {
                        return Promise.resolve();
                    }
                })
            }));
            MockExecutionContext.mockImplementation(() => ({
                dispose: jest.fn().mockResolvedValue(undefined),
                getNetwork: jest.fn().mockReturnValue(mockNetwork1),
                getOutputs: jest.fn().mockReturnValue(new Map([
                    ['deploy-step.address', '0x5FbDB2315678afecb367f032d93F642f64180aa3'],
                    ['deploy-step.hash', '0xmockdeployhash123']
                ]))
            }));
            const deployer = new deployer_1.Deployer(deployerOptions);
            await expect(deployer.run()).resolves.not.toThrow();
            const results = deployer.results;
            const jobAResult = results.get('job-a');
            const jobBResult = results.get('job-b');
            expect(jobAResult).toBeDefined();
            expect(jobAResult.outputs.get(mockNetwork1.chainId).status).toBe('success');
            expect(jobBResult).toBeDefined();
            expect(jobBResult.outputs.get(mockNetwork1.chainId).status).toBe('success');
        });
        it('should allow job B to run when job A is skipped', async () => {
            const jobA = {
                name: 'job-a',
                version: '1',
                description: 'Job A that will be skipped',
                skip_condition: [true],
                actions: [
                    {
                        name: 'deploy-step',
                        type: 'create-contract',
                        arguments: {
                            bytecode: TEST_BYTECODES.SIMPLE_CONTRACT,
                            value: '0'
                        },
                        output: true
                    }
                ]
            };
            const jobB = {
                name: 'job-b',
                version: '1',
                description: 'Job B that should run even if job A is skipped',
                depends_on: ['job-a'],
                actions: [
                    {
                        name: 'independent-action',
                        type: 'send-transaction',
                        arguments: {
                            to: '0x1234567890123456789012345678901234567890',
                            data: '0x',
                            value: '0'
                        }
                    }
                ]
            };
            const mockJobs = new Map();
            mockJobs.set('job-a', jobA);
            mockJobs.set('job-b', jobB);
            const mockTemplates = new Map();
            MockProjectLoader.mockImplementation(() => ({
                load: jest.fn().mockResolvedValue(undefined),
                jobs: mockJobs,
                templates: mockTemplates
            }));
            MockDependencyGraph.mockImplementation(() => ({
                getExecutionOrder: jest.fn().mockReturnValue(['job-a', 'job-b']),
                getDependencies: jest.fn().mockReturnValue(new Set())
            }));
            MockExecutionEngine.mockImplementation(() => ({
                executeJob: jest.fn().mockImplementation(async (job) => {
                    if (job.name === 'job-a') {
                        throw new Error('Job "job-a" skipped due to skip condition');
                    }
                    else if (job.name === 'job-b') {
                        return Promise.resolve();
                    }
                }),
                evaluateSkipConditions: jest.fn().mockImplementation(async (conditions, context, scope) => {
                    return conditions && conditions.length > 0 && conditions[0] === true;
                })
            }));
            MockExecutionContext.mockImplementation(() => ({
                dispose: jest.fn().mockResolvedValue(undefined),
                getNetwork: jest.fn().mockReturnValue(mockNetwork1),
                getOutputs: jest.fn().mockReturnValue(new Map([
                    ['independent-action.hash', '0xmocktransactionhash']
                ]))
            }));
            const deployer = new deployer_1.Deployer(deployerOptions);
            await expect(deployer.run()).resolves.not.toThrow();
            const results = deployer.results;
            const jobAResult = results.get('job-a');
            expect(jobAResult).toBeDefined();
            expect(jobAResult.outputs.get(mockNetwork1.chainId).status).toBe('skipped');
            expect(jobAResult.outputs.get(mockNetwork1.chainId).data).toContain('skipped due to skip condition');
            const jobBResult = results.get('job-b');
            expect(jobBResult).toBeDefined();
            expect(jobBResult.outputs.get(mockNetwork1.chainId).status).toBe('success');
        });
        it('should fail job B when job A fails, even with complex output references', async () => {
            const jobA = {
                name: 'job-a',
                version: '1',
                description: 'Deploy a contract with broken bytecode (will fail)',
                actions: [
                    {
                        name: 'failing-deploy',
                        type: 'create-contract',
                        arguments: {
                            bytecode: TEST_BYTECODES.BROKEN_BYTECODE,
                            value: '0'
                        },
                        output: true
                    }
                ]
            };
            const jobB = {
                name: 'job-b',
                version: '1',
                description: 'Use multiple outputs from failed job A',
                depends_on: ['job-a'],
                actions: [
                    {
                        name: 'use-multiple-outputs',
                        type: 'send-transaction',
                        arguments: {
                            to: '{{job-a.failing-deploy.address}}',
                            data: '0x',
                            value: '0'
                        }
                    }
                ]
            };
            const mockJobs = new Map();
            mockJobs.set('job-a', jobA);
            mockJobs.set('job-b', jobB);
            const mockTemplates = new Map();
            MockProjectLoader.mockImplementation(() => ({
                load: jest.fn().mockResolvedValue(undefined),
                jobs: mockJobs,
                templates: mockTemplates
            }));
            MockDependencyGraph.mockImplementation(() => ({
                getExecutionOrder: jest.fn().mockReturnValue(['job-a', 'job-b']),
                getDependencies: jest.fn().mockReturnValue(new Set())
            }));
            MockExecutionEngine.mockImplementation(() => ({
                executeJob: jest.fn().mockImplementation(async (job) => {
                    if (job.name === 'job-a') {
                        throw new Error('Contract deployment failed: invalid bytecode');
                    }
                })
            }));
            MockExecutionContext.mockImplementation(() => ({
                dispose: jest.fn().mockResolvedValue(undefined),
                getNetwork: jest.fn().mockReturnValue(mockNetwork1)
            }));
            const deployer = new deployer_1.Deployer(deployerOptions);
            await expect(deployer.run()).rejects.toThrow('One or more jobs failed during execution');
            const results = deployer.results;
            const jobAResult = results.get('job-a');
            expect(jobAResult).toBeDefined();
            expect(jobAResult.outputs.get(mockNetwork1.chainId).status).toBe('error');
            const jobBResult = results.get('job-b');
            expect(jobBResult).toBeDefined();
            const jobBError = jobBResult.outputs.get(mockNetwork1.chainId);
            expect(jobBError.status).toBe('error');
            expect(jobBError.data).toContain('depends on "job-a", but "job-a" failed');
        });
    });
    describe('run summary functionality', () => {
        let mockEventEmitter;
        let deployer;
        beforeEach(() => {
            mockEventEmitter = {
                emitEvent: jest.fn()
            };
            deployer = new deployer_1.Deployer({
                ...deployerOptions,
                eventEmitter: mockEventEmitter
            });
        });
        it('should emit run summary with success counts when all jobs succeed', () => {
            const mockResults = new Map();
            mockResults.set('job1', {
                job: mockJob1,
                outputs: new Map([
                    [1, { status: 'success', data: new Map([['action1.hash', '0xhash1'], ['action1.address', '0x1234567890123456789012345678901234567890']]) }],
                    [137, { status: 'success', data: new Map([['action1.hash', '0xhash1'], ['action1.address', '0x1234567890123456789012345678901234567890']]) }]
                ])
            });
            mockResults.set('job2', {
                job: mockJob2,
                outputs: new Map([
                    [1, { status: 'success', data: new Map([['action2.hash', '0xhash2'], ['action2.address', '0x9876543210987654321098765432109876543210']]) }],
                    [137, { status: 'success', data: new Map([['action2.hash', '0xhash2'], ['action2.address', '0x9876543210987654321098765432109876543210']]) }]
                ])
            });
            mockResults.set('job3', {
                job: mockJob3,
                outputs: new Map([
                    [1, { status: 'success', data: new Map([['action3.hash', '0xhash3']]) }]
                ])
            });
            deployer.results = mockResults;
            deployer.emitRunSummary(false);
            expect(mockEventEmitter.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'run_summary',
                level: 'info',
                data: expect.objectContaining({
                    networkCount: 2,
                    jobCount: 3,
                    successCount: 5,
                    failedCount: 0,
                    skippedCount: 0,
                    keyContracts: expect.arrayContaining([
                        { job: 'job1', action: 'action1', address: '0x1234567890123456789012345678901234567890' },
                        { job: 'job2', action: 'action2', address: '0x9876543210987654321098765432109876543210' }
                    ])
                })
            }));
        });
        it('should emit run summary with failure counts when some jobs fail', () => {
            const mockResults = new Map();
            mockResults.set('job1', {
                job: mockJob1,
                outputs: new Map([
                    [1, { status: 'error', data: 'Job1 failed' }],
                    [137, { status: 'error', data: 'Job1 failed' }]
                ])
            });
            mockResults.set('job2', {
                job: mockJob2,
                outputs: new Map([
                    [1, { status: 'success', data: new Map([['action2.hash', '0xhash2'], ['action2.address', '0x9876543210987654321098765432109876543210']]) }],
                    [137, { status: 'success', data: new Map([['action2.hash', '0xhash2'], ['action2.address', '0x9876543210987654321098765432109876543210']]) }]
                ])
            });
            mockResults.set('job3', {
                job: mockJob3,
                outputs: new Map([
                    [1, { status: 'success', data: new Map([['action3.hash', '0xhash3']]) }]
                ])
            });
            deployer.results = mockResults;
            deployer.emitRunSummary(true);
            expect(mockEventEmitter.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'run_summary',
                level: 'warn',
                data: expect.objectContaining({
                    networkCount: 2,
                    jobCount: 3,
                    successCount: 3,
                    failedCount: 2,
                    skippedCount: 0,
                    keyContracts: expect.arrayContaining([
                        { job: 'job2', action: 'action2', address: '0x9876543210987654321098765432109876543210' }
                    ])
                })
            }));
        });
        it('should emit run summary with skipped counts when jobs are skipped', () => {
            const mockResults = new Map();
            mockResults.set('job1', {
                job: mockJob1,
                outputs: new Map([
                    [1, { status: 'skipped', data: 'Job skipped due to network filter' }],
                    [137, { status: 'skipped', data: 'Job skipped due to network filter' }]
                ])
            });
            deployer.results = mockResults;
            deployer.emitRunSummary(false);
            expect(mockEventEmitter.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'run_summary',
                level: 'info',
                data: expect.objectContaining({
                    networkCount: 2,
                    jobCount: 1,
                    successCount: 0,
                    failedCount: 0,
                    skippedCount: 2,
                    keyContracts: []
                })
            }));
        });
        it('should limit key contracts to 10 entries', () => {
            const manyContractsJob = {
                name: 'many-contracts-job',
                version: '1.0.0',
                actions: Array.from({ length: 15 }, (_, i) => ({
                    name: `action${i}`,
                    template: 'template1',
                    arguments: {}
                }))
            };
            const mockResults = new Map();
            const manyOutputs = new Map();
            for (let i = 0; i < 15; i++) {
                manyOutputs.set(`action${i}.address`, `0x${i.toString().padStart(40, '0')}`);
                manyOutputs.set(`action${i}.hash`, `0xhash${i}`);
            }
            mockResults.set('many-contracts-job', {
                job: manyContractsJob,
                outputs: new Map([
                    [1, { status: 'success', data: manyOutputs }]
                ])
            });
            deployer.results = mockResults;
            deployer.emitRunSummary(false);
            expect(mockEventEmitter.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'run_summary',
                data: expect.objectContaining({
                    keyContracts: expect.arrayContaining([
                        { job: 'many-contracts-job', action: 'action0', address: '0x0000000000000000000000000000000000000000' },
                        { job: 'many-contracts-job', action: 'action1', address: '0x0000000000000000000000000000000000000001' },
                        { job: 'many-contracts-job', action: 'action9', address: '0x0000000000000000000000000000000000000009' }
                    ])
                })
            }));
            const summaryCall = mockEventEmitter.emitEvent.mock.calls.find((call) => call[0].type === 'run_summary');
            expect(summaryCall[0].data.keyContracts).toHaveLength(10);
        });
        it('should not emit run summary when showSummary is false', () => {
            const deployerWithoutSummary = new deployer_1.Deployer({
                ...deployerOptions,
                eventEmitter: mockEventEmitter,
                showSummary: false
            });
            expect(deployerWithoutSummary.showSummary).toBe(false);
            const mockResults = new Map();
            mockResults.set('job1', {
                job: mockJob1,
                outputs: new Map([
                    [1, { status: 'success', data: new Map([['action1.hash', '0xhash1']]) }]
                ])
            });
            deployerWithoutSummary.results = mockResults;
            deployerWithoutSummary.emitRunSummary(false);
            expect(mockEventEmitter.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'run_summary'
            }));
        });
        it('should emit run summary with mixed success/failure/skipped counts', () => {
            const mockResults = new Map();
            mockResults.set('success-job', {
                job: { name: 'success-job', version: '1.0.0', actions: [{ name: 'success-action', template: 'template1', arguments: {} }] },
                outputs: new Map([
                    [1, { status: 'success', data: new Map([['success-action.hash', '0xsuccess'], ['success-action.address', '0x1234567890123456789012345678901234567890']]) }],
                    [137, { status: 'success', data: new Map([['success-action.hash', '0xsuccess'], ['success-action.address', '0x1234567890123456789012345678901234567890']]) }]
                ])
            });
            mockResults.set('fail-job', {
                job: { name: 'fail-job', version: '1.0.0', actions: [{ name: 'fail-action', template: 'template1', arguments: {} }] },
                outputs: new Map([
                    [1, { status: 'error', data: 'Fail job failed' }],
                    [137, { status: 'error', data: 'Fail job failed' }]
                ])
            });
            mockResults.set('skipped-job', {
                job: { name: 'skipped-job', version: '1.0.0', actions: [{ name: 'skipped-action', template: 'template1', arguments: {} }] },
                outputs: new Map([
                    [1, { status: 'skipped', data: 'Job skipped' }],
                    [137, { status: 'skipped', data: 'Job skipped' }]
                ])
            });
            deployer.results = mockResults;
            deployer.emitRunSummary(true);
            expect(mockEventEmitter.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'run_summary',
                level: 'warn',
                data: expect.objectContaining({
                    networkCount: 2,
                    jobCount: 3,
                    successCount: 2,
                    failedCount: 2,
                    skippedCount: 2,
                    keyContracts: expect.arrayContaining([
                        { job: 'success-job', action: 'success-action', address: '0x1234567890123456789012345678901234567890' }
                    ])
                })
            }));
        });
        it('should handle empty results gracefully', () => {
            ;
            deployer.results = new Map();
            deployer.emitRunSummary(false);
            expect(mockEventEmitter.emitEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'run_summary',
                level: 'info',
                data: expect.objectContaining({
                    networkCount: 2,
                    jobCount: 0,
                    successCount: 0,
                    failedCount: 0,
                    skippedCount: 0,
                    keyContracts: []
                })
            }));
        });
    });
});
//# sourceMappingURL=deployer.spec.js.map