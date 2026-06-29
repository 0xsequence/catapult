"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const source_1 = require("../source");
describe('Source Provenance Parsing', () => {
    it('should return null for non-source YAML documents', () => {
        const result = (0, source_1.parseSourceDocument)(`
type: constants
constants:
  value: 1
`);
        expect(result).toBeNull();
    });
    it('should parse source provenance documents', () => {
        const result = (0, source_1.parseSourceDocument)(`
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
    ref: "v3.0.0-rc.5"
    commit: "0d9061f229da73edae890e6fdd1fbf753028df6d"
    build: "forge build --build-info"
    contracts:
      "src/Stage1Module.sol:Stage1Module":
        ref: "stage1-special"
`);
        expect(result).not.toBeNull();
        expect(result.build_info['./stage1.json'].repo).toBe('https://github.com/0xsequence/wallet-contracts-v3');
        expect(result.build_info['./stage1.json'].contracts?.['src/Stage1Module.sol:Stage1Module'].ref).toBe('stage1-special');
    });
    it('should require repo on each build-info provenance entry', () => {
        const result = (0, source_1.parseSourceDocument)(`
type: source
build_info:
  "./stage1.json":
    ref: "v3.0.0-rc.5"
`);
        expect(result).not.toBeNull();
        expect(result.build_info).toEqual({});
        expect(result.warnings).toEqual([
            expect.stringContaining('build_info["./stage1.json"].repo')
        ]);
    });
    it('should validate optional string fields', () => {
        const result = (0, source_1.parseSourceDocument)(`
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
    commit: 123
`);
        expect(result).not.toBeNull();
        expect(result.build_info).toEqual({});
        expect(result.warnings).toEqual([
            expect.stringContaining('commit')
        ]);
    });
    it('should reject unsupported fields', () => {
        const result = (0, source_1.parseSourceDocument)(`
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
    path: "contracts"
`);
        expect(result).not.toBeNull();
        expect(result.build_info).toEqual({});
        expect(result.warnings).toEqual([
            expect.stringContaining('path is not supported')
        ]);
    });
    it('should quote build-info paths in validation errors', () => {
        const result = (0, source_1.parseSourceDocument)(`
type: source
build_info:
  "./stage1.json":
    ref: "v3.0.0-rc.5"
`);
        expect(result).not.toBeNull();
        expect(result.warnings).toEqual([
            expect.stringContaining('build_info["./stage1.json"].repo')
        ]);
    });
    it('should keep valid entries when sibling entries are invalid', () => {
        const result = (0, source_1.parseSourceDocument)(`
type: source
build_info:
  "./stage1.json":
    repo: "https://github.com/0xsequence/wallet-contracts-v3"
  "./bad.json":
    typo_field: true
`);
        expect(result).not.toBeNull();
        expect(Object.keys(result.build_info)).toEqual(['./stage1.json']);
        expect(result.warnings).toEqual([
            expect.stringContaining('typo_field is not supported')
        ]);
    });
    describe('mergeSourceProvenance', () => {
        it('should merge contract overrides into build-info provenance', () => {
            const result = (0, source_1.mergeSourceProvenance)({
                repo: 'https://github.com/0xsequence/wallet-contracts-v3',
                ref: 'v3.0.0-rc.5',
                commit: '0d9061f229da73edae890e6fdd1fbf753028df6d',
                contracts: {
                    'src/Stage1Module.sol:Stage1Module': {
                        ref: 'stage1-special'
                    }
                }
            }, {
                ref: 'stage1-special'
            });
            expect(result).toEqual({
                repo: 'https://github.com/0xsequence/wallet-contracts-v3',
                ref: 'stage1-special',
                commit: '0d9061f229da73edae890e6fdd1fbf753028df6d'
            });
            expect(result).not.toHaveProperty('contracts');
        });
    });
});
//# sourceMappingURL=source.spec.js.map