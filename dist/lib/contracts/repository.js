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
exports.ContractRepository = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const artifact_1 = require("../parsers/artifact");
const buildinfo_1 = require("../parsers/buildinfo");
const source_1 = require("../parsers/source");
class ContractRepository {
    constructor() {
        this.contracts = new Map();
        this.referenceMap = new Map();
        this.ambiguousReferences = new Set();
        this.sourceProvenanceByBuildInfoPath = new Map();
    }
    async loadFrom(projectRoot) {
        const files = await this.findProjectFiles(projectRoot);
        await this.loadSourceProvenanceFiles(files.sourceFiles);
        for (const filePath of files.contractFiles) {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                await this.parseAndHydrateFromFile(content, filePath);
            }
            catch (error) {
            }
        }
        this.disambiguateReferences();
    }
    async parseAndHydrateFromFile(content, filePath) {
        if ((0, buildinfo_1.isBuildInfoFile)(filePath)) {
            const extractedContracts = (0, buildinfo_1.parseBuildInfo)(content, filePath);
            if (extractedContracts) {
                for (const extracted of extractedContracts) {
                    const sourceProvenance = this.getSourceProvenance(filePath, extracted.fullyQualifiedName);
                    this.hydrateContract({
                        creationCode: extracted.bytecode,
                        runtimeBytecode: extracted.deployedBytecode,
                        abi: extracted.abi,
                        sourceName: extracted.sourceName,
                        contractName: extracted.contractName,
                        source: extracted.source,
                        compiler: extracted.compiler,
                        buildInfoId: extracted.buildInfoId,
                        sourceProvenance,
                    }, filePath);
                }
                return;
            }
        }
        const parsed = (0, artifact_1.parseArtifact)(content, filePath);
        if (parsed) {
            this.hydrateContract({
                creationCode: parsed.bytecode,
                runtimeBytecode: parsed.deployedBytecode,
                abi: parsed.abi,
                sourceName: parsed.sourceName,
                contractName: parsed.contractName,
                source: parsed.source,
                compiler: parsed.compiler,
            }, filePath);
        }
    }
    hydrateContract(data, sourceFilePath) {
        if (data.creationCode === null || data.creationCode === undefined) {
            throw new Error(`Cannot hydrate contract from ${sourceFilePath}: missing creation code`);
        }
        const uniqueHash = (0, crypto_1.createHash)('sha256').update(data.creationCode).digest('hex');
        let contract = this.contracts.get(uniqueHash);
        if (!contract) {
            contract = {
                uniqueHash,
                creationCode: data.creationCode,
                _sources: new Set(),
                _sourceProvenance: new Map()
            };
            this.contracts.set(uniqueHash, contract);
        }
        contract._sources.add(sourceFilePath);
        const isFromBuildInfo = sourceFilePath.includes('/build-info/');
        if (data.runtimeBytecode && (!contract.runtimeBytecode || isFromBuildInfo)) {
            contract.runtimeBytecode = data.runtimeBytecode;
        }
        if (data.abi && (!contract.abi || contract.abi.length === 0 || isFromBuildInfo)) {
            contract.abi = data.abi;
        }
        if (data.sourceName && (!contract.sourceName || isFromBuildInfo)) {
            contract.sourceName = data.sourceName;
        }
        if (data.contractName && (!contract.contractName || isFromBuildInfo)) {
            contract.contractName = data.contractName;
        }
        if (data.source && (!contract.source || isFromBuildInfo)) {
            contract.source = data.source;
        }
        if (data.compiler && (!contract.compiler || isFromBuildInfo)) {
            contract.compiler = data.compiler;
        }
        if (data.buildInfoId && !contract.buildInfoId) {
            contract.buildInfoId = data.buildInfoId;
        }
        if (data.sourceProvenance) {
            if (!contract._sourceProvenance) {
                contract._sourceProvenance = new Map();
            }
            contract._sourceProvenance.set(sourceFilePath, data.sourceProvenance);
            contract.sourceProvenance = this.selectPreferredSourceProvenance(contract._sourceProvenance);
        }
    }
    getSourceProvenance(buildInfoPath, fullyQualifiedName) {
        const provenance = this.sourceProvenanceByBuildInfoPath.get(buildInfoPath);
        if (!provenance) {
            return undefined;
        }
        return (0, source_1.mergeSourceProvenance)(provenance, provenance.contracts?.[fullyQualifiedName]);
    }
    selectPreferredSourceProvenance(sourceProvenance) {
        const firstEntry = Array.from(sourceProvenance.entries()).sort(([a], [b]) => a.localeCompare(b))[0];
        return firstEntry?.[1];
    }
    disambiguateReferences() {
        this.referenceMap.clear();
        this.ambiguousReferences.clear();
        for (const contract of this.contracts.values()) {
            const references = [];
            if (contract.contractName) {
                references.push(contract.contractName);
            }
            if (contract.sourceName && contract.contractName) {
                references.push(`${contract.sourceName}:${contract.contractName}`);
            }
            for (const sourcePath of contract._sources) {
                if (!(0, buildinfo_1.isBuildInfoFile)(sourcePath)) {
                    references.push(sourcePath);
                    const relativePath = path.relative(process.cwd(), sourcePath);
                    if (relativePath !== sourcePath) {
                        references.push(relativePath);
                    }
                }
            }
            for (const ref of references) {
                if (!this.referenceMap.has(ref)) {
                    this.referenceMap.set(ref, []);
                }
                if (!this.referenceMap.get(ref).includes(contract.uniqueHash)) {
                    this.referenceMap.get(ref).push(contract.uniqueHash);
                }
            }
        }
        for (const [reference, hashes] of this.referenceMap.entries()) {
            if (hashes.length > 1) {
                this.ambiguousReferences.add(reference);
            }
        }
    }
    lookup(reference, contextPath) {
        let resolvedReference = reference;
        if (contextPath && (reference.startsWith('./') || reference.startsWith('../'))) {
            resolvedReference = path.resolve(path.dirname(contextPath), reference);
        }
        if (resolvedReference.includes(':')) {
            const colonIndex = resolvedReference.lastIndexOf(':');
            const filePath = resolvedReference.substring(0, colonIndex);
            const contractName = resolvedReference.substring(colonIndex + 1);
            if ((0, buildinfo_1.isBuildInfoFile)(filePath)) {
                for (const contract of this.contracts.values()) {
                    if (contract.contractName === contractName && contract._sources.has(filePath)) {
                        return contract;
                    }
                }
                return null;
            }
        }
        if (this.ambiguousReferences.has(resolvedReference)) {
            const hashes = this.referenceMap.get(resolvedReference) || [];
            const conflictingSources = hashes.map(hash => {
                const contract = this.contracts.get(hash);
                return contract ? Array.from(contract._sources).join(', ') : 'unknown';
            });
            throw new Error(`Ambiguous contract reference "${resolvedReference}". Found in multiple contracts: ${conflictingSources.join(' | ')}`);
        }
        if (this.contracts.has(resolvedReference)) {
            return this.contracts.get(resolvedReference);
        }
        const hashes = this.referenceMap.get(resolvedReference);
        if (hashes && hashes.length === 1) {
            return this.contracts.get(hashes[0]) || null;
        }
        return null;
    }
    getAll() {
        return Array.from(this.contracts.values());
    }
    getAmbiguousReferences() {
        return Array.from(this.ambiguousReferences);
    }
    addForTesting(contractData) {
        this.hydrateContract({
            creationCode: contractData.bytecode,
            runtimeBytecode: contractData.deployedBytecode,
            abi: contractData.abi,
            sourceName: contractData.sourceName,
            contractName: contractData.contractName,
            source: contractData.source,
            compiler: contractData.compiler,
            buildInfoId: contractData.buildInfoId,
            sourceProvenance: contractData.sourceProvenance,
        }, contractData._path);
        this.disambiguateReferences();
    }
    async findProjectFiles(dir, ignoreDirs = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])) {
        const results = {
            contractFiles: [],
            sourceFiles: []
        };
        try {
            const list = await fs.readdir(dir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.resolve(dir, dirent.name);
                if (dirent.isDirectory()) {
                    if (!ignoreDirs.has(dirent.name)) {
                        const childResults = await this.findProjectFiles(fullPath, ignoreDirs);
                        results.contractFiles.push(...childResults.contractFiles);
                        results.sourceFiles.push(...childResults.sourceFiles);
                    }
                }
                else if (dirent.isFile() && dirent.name.endsWith('.json')) {
                    results.contractFiles.push(fullPath);
                }
                else if (dirent.isFile() && (dirent.name === 'source.yaml' || dirent.name === 'source.yml')) {
                    results.sourceFiles.push(fullPath);
                }
            }
        }
        catch (err) {
        }
        return results;
    }
    async loadSourceProvenanceFiles(sourceFiles) {
        this.sourceProvenanceByBuildInfoPath.clear();
        for (const sourceFilePath of sourceFiles) {
            let sourceDocument;
            try {
                const content = await fs.readFile(sourceFilePath, 'utf-8');
                sourceDocument = (0, source_1.parseSourceDocument)(content);
            }
            catch (error) {
                this.warnSourceProvenance(`Skipping source provenance file ${sourceFilePath}: ${error instanceof Error ? error.message : String(error)}`);
                continue;
            }
            if (!sourceDocument) {
                continue;
            }
            for (const warning of sourceDocument.warnings || []) {
                this.warnSourceProvenance(`Skipping source provenance entry ${sourceFilePath}: ${warning}`);
            }
            const sourceDir = path.dirname(sourceFilePath);
            for (const [buildInfoRef, provenance] of Object.entries(sourceDocument.build_info)) {
                const buildInfoPath = path.resolve(sourceDir, buildInfoRef);
                if (!(0, buildinfo_1.isBuildInfoFile)(buildInfoPath)) {
                    this.warnSourceProvenance(`Skipping source provenance entry ${sourceFilePath}: "${buildInfoRef}" does not point to a build-info JSON file.`);
                    continue;
                }
                if (!await this.pathExists(buildInfoPath)) {
                    this.warnSourceProvenance(`Skipping source provenance entry ${sourceFilePath}: build-info file "${buildInfoRef}" does not exist.`);
                    continue;
                }
                if (this.sourceProvenanceByBuildInfoPath.has(buildInfoPath)) {
                    this.warnSourceProvenance(`Skipping source provenance entry ${sourceFilePath}: duplicate provenance for build-info file "${buildInfoRef}".`);
                    continue;
                }
                this.sourceProvenanceByBuildInfoPath.set(buildInfoPath, {
                    ...provenance,
                    sourceDocumentPath: sourceFilePath,
                    buildInfoPath
                });
            }
        }
    }
    async pathExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    warnSourceProvenance(message) {
        console.warn(message);
    }
}
exports.ContractRepository = ContractRepository;
//# sourceMappingURL=repository.js.map