"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const engine_1 = require("../engine");
const repository_1 = require("../../contracts/repository");
const etherscan_1 = require("../../verification/etherscan");
describe('Static Action', () => {
    let engine;
    let context;
    let mockNetwork;
    let mockRegistry;
    let templates;
    beforeEach(() => {
        mockNetwork = { name: 'testnet', chainId: 999, rpcUrl: 'http://localhost:8545' };
        mockRegistry = new repository_1.ContractRepository();
        context = {
            getNetwork: () => mockNetwork,
            setOutput: jest.fn(),
            getOutput: jest.fn(),
            setContextPath: jest.fn(),
            getContextPath: jest.fn(),
            dispose: jest.fn()
        };
        templates = new Map();
        const verificationRegistry = new etherscan_1.VerificationPlatformRegistry();
        engine = new engine_1.ExecutionEngine(templates, { verificationRegistry });
    });
    describe('static primitive action', () => {
        it('should store the provided value unchanged', async () => {
            const action = {
                type: 'static',
                name: 'test-static',
                arguments: {
                    value: 'hello world'
                }
            };
            await engine.executePrimitive(action, context, new Map());
            expect(context.setOutput).toHaveBeenCalledWith('test-static.value', 'hello world');
        });
        it('should work with numeric values', async () => {
            const action = {
                type: 'static',
                name: 'numeric-static',
                arguments: {
                    value: 42
                }
            };
            await engine.executePrimitive(action, context, new Map());
            expect(context.setOutput).toHaveBeenCalledWith('numeric-static.value', 42);
        });
        it('should work with boolean values', async () => {
            const action = {
                type: 'static',
                name: 'boolean-static',
                arguments: {
                    value: true
                }
            };
            await engine.executePrimitive(action, context, new Map());
            expect(context.setOutput).toHaveBeenCalledWith('boolean-static.value', true);
        });
        it('should work with object values', async () => {
            const testObject = { foo: 'bar', number: 123 };
            const mockResolver = {
                resolve: jest.fn().mockResolvedValue(testObject)
            };
            engine.resolver = mockResolver;
            const action = {
                type: 'static',
                name: 'object-static',
                arguments: {
                    value: testObject
                }
            };
            await engine.executePrimitive(action, context, new Map());
            expect(mockResolver.resolve).toHaveBeenCalledWith(testObject, context, new Map());
            expect(context.setOutput).toHaveBeenCalledWith('object-static.value', testObject);
        });
        it('should work with array values', async () => {
            const testArray = [1, 2, 3, 'test'];
            const action = {
                type: 'static',
                name: 'array-static',
                arguments: {
                    value: testArray
                }
            };
            await engine.executePrimitive(action, context, new Map());
            expect(context.setOutput).toHaveBeenCalledWith('array-static.value', testArray);
        });
        it('should not store outputs when action has no name', async () => {
            const action = {
                type: 'static',
                arguments: {
                    value: 'test value'
                }
            };
            await engine.executePrimitive(action, context, new Map());
            expect(context.setOutput).not.toHaveBeenCalled();
        });
        it('should resolve template variables from context', async () => {
            const mockResolver = {
                resolve: jest.fn().mockResolvedValue('resolved value')
            };
            engine.resolver = mockResolver;
            const action = {
                type: 'static',
                name: 'resolved-static',
                arguments: {
                    value: '{{some_variable}}'
                }
            };
            await engine.executePrimitive(action, context, new Map());
            expect(mockResolver.resolve).toHaveBeenCalledWith('{{some_variable}}', context, new Map());
            expect(context.setOutput).toHaveBeenCalledWith('resolved-static.value', 'resolved value');
        });
        it('should resolve template variables from scope', async () => {
            const scope = new Map();
            scope.set('template_var', 'scope value');
            const mockResolver = {
                resolve: jest.fn().mockResolvedValue('scope value')
            };
            engine.resolver = mockResolver;
            const action = {
                type: 'static',
                name: 'scope-static',
                arguments: {
                    value: '{{template_var}}'
                }
            };
            await engine.executePrimitive(action, context, scope);
            expect(mockResolver.resolve).toHaveBeenCalledWith('{{template_var}}', context, scope);
            expect(context.setOutput).toHaveBeenCalledWith('scope-static.value', 'scope value');
        });
    });
});
//# sourceMappingURL=static-action.spec.js.map