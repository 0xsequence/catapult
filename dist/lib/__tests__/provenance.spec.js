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
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const provenance_1 = require("../provenance");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
async function git(cwd, args) {
    const result = await execFileAsync('git', args, { cwd });
    return String(result.stdout).trim();
}
async function writeFile(filePath, content) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
}
function sourceYaml(repo, commit, build) {
    return `
type: source
build_info:
  "./stage1.json":
    repo: ${JSON.stringify(repo)}
    commit: ${JSON.stringify(commit)}
    build: ${JSON.stringify(build)}
`;
}
function jobYaml(name, dependsOn = []) {
    const depends = dependsOn.length > 0 ? `depends_on: ${JSON.stringify(dependsOn)}\n` : '';
    return `
name: ${JSON.stringify(name)}
version: "1.0.0"
${depends}actions:
  - name: "noop"
    type: "static"
    arguments:
      value: true
`;
}
describe('source provenance operations', () => {
    let tempDir;
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'catapult-provenance-test-'));
    });
    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });
    it('collects source provenance entries even when build-info is missing', async () => {
        const projectRoot = path.join(tempDir, 'project');
        const sourcePath = path.join(projectRoot, 'jobs', 'demo', 'build-info', 'source.yaml');
        await writeFile(sourcePath, sourceYaml('https://github.com/example/repo', 'abc123', 'forge build --build-info'));
        const result = await (0, provenance_1.collectSourceProvenanceEntries)(projectRoot);
        expect(result.warnings).toEqual([]);
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0]).toMatchObject({
            sourceDocumentPath: sourcePath,
            buildInfoRef: './stage1.json',
            buildInfoPath: path.join(projectRoot, 'jobs', 'demo', 'build-info', 'stage1.json')
        });
    });
    it('can scope provenance entries to a job and its dependencies', async () => {
        const projectRoot = path.join(tempDir, 'project');
        await writeFile(path.join(projectRoot, 'jobs', 'base.yaml'), jobYaml('base'));
        await writeFile(path.join(projectRoot, 'jobs', 'child.yaml'), jobYaml('child', ['base']));
        await writeFile(path.join(projectRoot, 'jobs', 'base', 'build-info', 'source.yaml'), sourceYaml('https://github.com/example/base', 'abc123', 'build-base'));
        await writeFile(path.join(projectRoot, 'jobs', 'child', 'build-info', 'source.yaml'), sourceYaml('https://github.com/example/child', 'def456', 'build-child'));
        const childOnly = await (0, provenance_1.collectSourceProvenanceEntries)(projectRoot, {
            jobs: ['child'],
            loadStdTemplates: false
        });
        const withDependencies = await (0, provenance_1.collectSourceProvenanceEntries)(projectRoot, {
            jobs: ['child'],
            includeDependencies: true,
            loadStdTemplates: false
        });
        expect(childOnly.entries.map(entry => entry.provenance.repo)).toEqual(['https://github.com/example/child']);
        expect(withDependencies.entries.map(entry => entry.provenance.repo).sort()).toEqual([
            'https://github.com/example/base',
            'https://github.com/example/child'
        ]);
    });
    it('generates missing build-info from a local Git provenance repo', async () => {
        const { projectRoot, expectedBuildInfo } = await createProjectWithLocalProvenanceRepo();
        const result = await (0, provenance_1.generateBuildInfoFromSourceProvenance)(projectRoot);
        const generatedPath = path.join(projectRoot, 'jobs', 'demo', 'build-info', 'stage1.json');
        const generatedJson = JSON.parse(await fs.readFile(generatedPath, 'utf-8'));
        expect(result.results).toHaveLength(1);
        expect(result.results[0].status).toBe('generated');
        expect(generatedJson).toEqual(expectedBuildInfo);
    });
    it('verifies generated build-info and reports mismatches', async () => {
        const { projectRoot } = await createProjectWithLocalProvenanceRepo();
        const targetPath = path.join(projectRoot, 'jobs', 'demo', 'build-info', 'stage1.json');
        await (0, provenance_1.generateBuildInfoFromSourceProvenance)(projectRoot);
        const verified = await (0, provenance_1.verifySourceProvenance)(projectRoot);
        expect(verified.results[0].status).toBe('verified');
        const changed = JSON.parse(await fs.readFile(targetPath, 'utf-8'));
        changed.solcVersion = '0.8.1';
        await fs.writeFile(targetPath, JSON.stringify(changed, null, 2));
        const mismatch = await (0, provenance_1.verifySourceProvenance)(projectRoot);
        expect(mismatch.results[0].status).toBe('failed');
        expect(mismatch.results[0].message).toContain('does not match');
        expect(mismatch.results[0].message).toContain('$.solcVersion');
    });
    it('normalizes checkout-local build-info paths and top-level ids while verifying', async () => {
        const { projectRoot } = await createProjectWithLocalProvenanceRepo({ checkoutSensitiveBuildInfo: true });
        const targetPath = path.join(projectRoot, 'jobs', 'demo', 'build-info', 'stage1.json');
        await (0, provenance_1.generateBuildInfoFromSourceProvenance)(projectRoot);
        const generatedJson = JSON.parse(await fs.readFile(targetPath, 'utf-8'));
        expect(generatedJson.id).toContain('catapult-provenance-');
        expect(generatedJson.input.basePath).toContain('catapult-provenance-');
        const verified = await (0, provenance_1.verifySourceProvenance)(projectRoot);
        expect(verified.results[0].status).toBe('verified');
    });
    async function createProjectWithLocalProvenanceRepo(options = {}) {
        const sourceRepo = path.join(tempDir, 'source-repo');
        const projectRoot = path.join(tempDir, 'project');
        await fs.mkdir(sourceRepo, { recursive: true });
        const expectedBuildInfo = {
            _format: 'hh-sol-build-info-1',
            id: 'stage1',
            solcVersion: '0.8.0',
            input: {
                language: 'Solidity',
                sources: {}
            },
            output: {
                contracts: {}
            }
        };
        const buildInfoScript = options.checkoutSensitiveBuildInfo
            ? `
const fs = require('fs')
const path = require('path')
const buildInfo = {
  _format: 'hh-sol-build-info-1',
  id: path.basename(path.dirname(__dirname)),
  solcVersion: '0.8.0',
  input: {
    language: 'Solidity',
    basePath: __dirname,
    allowPaths: [__dirname, path.join(__dirname, 'lib')],
    includePaths: [__dirname],
    sources: {}
  },
  output: {
    contracts: {}
  }
}
fs.mkdirSync(path.join(__dirname, 'out', 'build-info'), { recursive: true })
fs.writeFileSync(path.join(__dirname, 'out', 'build-info', 'stage1.json'), JSON.stringify(buildInfo, null, 2))
`
            : `
const fs = require('fs')
const path = require('path')
fs.mkdirSync(path.join(__dirname, 'out', 'build-info'), { recursive: true })
fs.writeFileSync(path.join(__dirname, 'out', 'build-info', 'stage1.json'), JSON.stringify(${JSON.stringify(expectedBuildInfo)}, null, 2))
`;
        await writeFile(path.join(sourceRepo, 'build-info.js'), `
${buildInfoScript.trim()}
`);
        await git(sourceRepo, ['init']);
        await git(sourceRepo, ['config', 'user.email', 'catapult@example.com']);
        await git(sourceRepo, ['config', 'user.name', 'Catapult Test']);
        await git(sourceRepo, ['add', 'build-info.js']);
        await git(sourceRepo, ['commit', '-m', 'add build script']);
        const commit = await git(sourceRepo, ['rev-parse', 'HEAD']);
        await writeFile(path.join(projectRoot, 'jobs', 'demo', 'build-info', 'source.yaml'), sourceYaml(sourceRepo, commit, 'node build-info.js'));
        return { projectRoot, expectedBuildInfo };
    }
});
//# sourceMappingURL=provenance.spec.js.map