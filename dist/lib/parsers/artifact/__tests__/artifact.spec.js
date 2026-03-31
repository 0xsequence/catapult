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
const index_1 = require("../index");
describe('Artifact Parsing', () => {
    const fixturesDir = path.join(__dirname, 'fixtures');
    const readFixture = (filename) => {
        return fs.readFileSync(path.join(fixturesDir, filename), 'utf-8');
    };
    describe('parseArtifact function', () => {
        it('should parse a simple artifact with string bytecode', () => {
            const content = readFixture('simple-artifact.json');
            const result = (0, index_1.parseArtifact)(content, '/test/simple-artifact.json');
            expect(result).not.toBeNull();
            expect(result.contractName).toBe('SimpleToken');
            expect(result.abi).toBeInstanceOf(Array);
            expect(result.abi.length).toBe(2);
            expect(result.bytecode).toMatch(/^0x[0-9a-fA-F]+$/);
            expect(result.deployedBytecode).toMatch(/^0x[0-9a-fA-F]+$/);
        });
        it('should parse a Hardhat-style artifact with bytecode object', () => {
            const content = readFixture('hardhat-artifact.json');
            const result = (0, index_1.parseArtifact)(content, '/test/hardhat-artifact.json');
            expect(result).not.toBeNull();
            expect(result.contractName).toBe('ERC20Token');
            expect(result.sourceName).toBe('contracts/ERC20Token.sol');
            expect(result.abi).toBeInstanceOf(Array);
            expect(result.abi.length).toBe(3);
            expect(result.bytecode).toMatch(/^0x[0-9a-fA-F]+$/);
            expect(result.deployedBytecode).toMatch(/^0x[0-9a-fA-F]+$/);
            expect(result.compiler).toBeDefined();
            expect(result.compiler.version).toBe('0.8.19+commit.7dd6d404');
            expect(result.source).toContain('contract ERC20Token');
        });
        it('should parse a minimal artifact with only required fields', () => {
            const content = readFixture('minimal-artifact.json');
            const result = (0, index_1.parseArtifact)(content, '/test/minimal-artifact.json');
            expect(result).not.toBeNull();
            expect(result.contractName).toBe('Minimal');
            expect(result.abi).toBeInstanceOf(Array);
            expect(result.abi.length).toBe(0);
            expect(result.bytecode).toBe('0x608060405234801561001057600080fd5b50');
            expect(result.deployedBytecode).toBeUndefined();
            expect(result.sourceName).toBeUndefined();
            expect(result.source).toBeUndefined();
            expect(result.compiler).toBeUndefined();
        });
        it('should return null for invalid JSON', () => {
            const content = readFixture('invalid-json.txt');
            const result = (0, index_1.parseArtifact)(content, '/test/invalid-json.txt');
            expect(result).toBeNull();
        });
        it('should derive contractName from filename when missing', () => {
            const content = readFixture('missing-contract-name.json');
            const result = (0, index_1.parseArtifact)(content, '/test/missing-contract-name.json');
            expect(result).not.toBeNull();
            expect(result.contractName).toBe('missing-contract-name');
        });
        it('should return null when abi is missing', () => {
            const content = readFixture('missing-abi.json');
            const result = (0, index_1.parseArtifact)(content, '/test/missing-abi.json');
            expect(result).toBeNull();
        });
        it('should return null when bytecode is missing', () => {
            const content = readFixture('missing-bytecode.json');
            const result = (0, index_1.parseArtifact)(content, '/test/missing-bytecode.json');
            expect(result).toBeNull();
        });
        it('should return null when bytecode does not start with 0x', () => {
            const content = readFixture('invalid-bytecode.json');
            const result = (0, index_1.parseArtifact)(content, '/test/invalid-bytecode.json');
            expect(result).toBeNull();
        });
        it('should return null when bytecode is empty', () => {
            const content = readFixture('empty-bytecode.json');
            const result = (0, index_1.parseArtifact)(content, '/test/empty-bytecode.json');
            expect(result).toBeNull();
        });
        it('should return null when fields have wrong types', () => {
            const content = readFixture('wrong-types.json');
            const result = (0, index_1.parseArtifact)(content, '/test/wrong-types.json');
            expect(result).toBeNull();
        });
        it('should handle null input gracefully', () => {
            const result = (0, index_1.parseArtifact)('null', '/test/null.json');
            expect(result).toBeNull();
        });
        it('should handle empty string input gracefully', () => {
            const result = (0, index_1.parseArtifact)('', '/test/empty.json');
            expect(result).toBeNull();
        });
    });
});
//# sourceMappingURL=artifact.spec.js.map