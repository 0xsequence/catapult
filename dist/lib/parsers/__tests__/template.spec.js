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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const template_1 = require("../template");
const types_1 = require("../../types");
describe('parseTemplate', () => {
    it('should correctly parse a valid template with a complex structure (sequence-factory-v1)', () => {
        const yamlPath = path.resolve(__dirname, '../../../../examples/templates/sequence-factory-v1.yaml');
        const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
        const template = (0, template_1.parseTemplate)(yamlContent);
        expect(template.name).toBe('sequence-factory-v1');
        expect(template.arguments).toBeDefined();
        expect(template.returns).toBeDefined();
        expect(template.actions).toHaveLength(1);
        expect(template.outputs).toBeDefined();
        expect(template.outputs?.address).toBeDefined();
        expect(template.setup).toBeDefined();
        expect(template.setup?.actions).toBeUndefined();
        expect(template.setup?.skip_condition).toHaveLength(1);
        expect((0, types_1.isJobCompletedCondition)(template.setup?.skip_condition?.[0])).toBe(true);
    });
    it('should correctly parse a template with an object-based setup block (nano-universal-deployer)', () => {
        const yamlPath = path.resolve(__dirname, '../../std/templates/nano-universal-deployer.yaml');
        const yamlContent = fs.readFileSync(yamlPath, 'utf-8');
        const template = (0, template_1.parseTemplate)(yamlContent);
        expect(template.name).toBe('nano-universal-deployer');
        expect(template.setup).toBeDefined();
        expect(template.setup?.actions).toHaveLength(3);
        expect(template.setup?.skip_condition).toHaveLength(1);
        expect(template.setup?.actions?.[0].type).toBe('test-nicks-method');
        expect((0, types_1.isContractExistsCondition)(template.setup?.skip_condition?.[0])).toBe(true);
    });
    it('should parse a template with no optional fields like setup, description, arguments, or outputs', () => {
        const minimalYaml = `
name: minimal-template
actions:
  - type: send-transaction
    arguments:
      to: '0x123'
      data: '0xabc'
`;
        const template = (0, template_1.parseTemplate)(minimalYaml);
        expect(template.name).toBe('minimal-template');
        expect(template.description).toBeUndefined();
        expect(template.arguments).toBeUndefined();
        expect(template.setup).toBeUndefined();
        expect(template.actions).toHaveLength(1);
        expect(template.outputs).toBeUndefined();
    });
    it('should throw an error for malformed YAML', () => {
        const invalidYaml = `
name: bad-yaml
  actions: - item1
`;
        expect(() => (0, template_1.parseTemplate)(invalidYaml)).toThrow(/Failed to parse template YAML:.* at line 2/);
    });
    it('should throw an error if the "name" field is missing', () => {
        const yamlContent = `
version: "1.0"
actions: []
`;
        expect(() => (0, template_1.parseTemplate)(yamlContent)).toThrow('Invalid template: "name" field is required and must be a string.');
    });
    it('should throw an error if the "actions" field is missing or not an array', () => {
        const missingActions = `
name: "my-template"
`;
        expect(() => (0, template_1.parseTemplate)(missingActions)).toThrow('Invalid template "my-template": "actions" field is required and must be an array.');
        const wrongTypeActions = `
name: "my-template"
actions: "not-an-array"
`;
        expect(() => (0, template_1.parseTemplate)(wrongTypeActions)).toThrow('Invalid template "my-template": "actions" field is required and must be an array.');
    });
    it('should throw an error if the "outputs" field is not an object when provided', () => {
        const wrongTypeOutputs = `
name: "my-template"
actions: []
outputs: ["not-an-object"]
`;
        expect(() => (0, template_1.parseTemplate)(wrongTypeOutputs)).toThrow('Invalid template "my-template": "outputs" field must be an object if provided.');
    });
    it('should throw an error if the "setup" field is not an array or object', () => {
        const invalidSetup = `
name: "my-template"
actions: []
setup: "i-am-a-string"
`;
        expect(() => (0, template_1.parseTemplate)(invalidSetup)).toThrow('Invalid template "my-template": "setup" field must be an array or an object if provided.');
    });
});
//# sourceMappingURL=template.spec.js.map