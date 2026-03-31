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
exports.ProjectLoader = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const parsers_1 = require("../parsers");
const repository_1 = require("../contracts/repository");
const constants_1 = require("../parsers/constants");
class ProjectLoader {
    constructor(projectRoot, options = {}) {
        this.projectRoot = projectRoot;
        this.options = options;
        this.jobs = new Map();
        this.templates = new Map();
        this.constants = new Map();
        this.constantSources = new Map();
        this.contractRepository = new repository_1.ContractRepository();
    }
    async load() {
        await this.contractRepository.loadFrom(this.projectRoot);
        if (this.options.loadStdTemplates !== false) {
            const stdTemplatePath = path.resolve(__dirname, '..', 'std', 'templates');
            if (await this.pathExists(stdTemplatePath)) {
                await this.loadTemplatesFromDir(stdTemplatePath);
            }
        }
        const userTemplatePath = path.join(this.projectRoot, 'templates');
        if (await this.pathExists(userTemplatePath)) {
            await this.loadTemplatesFromDir(userTemplatePath);
        }
        const jobsPath = path.join(this.projectRoot, 'jobs');
        if (await this.pathExists(jobsPath)) {
            await this.loadJobsFromDir(jobsPath);
        }
        if (await this.pathExists(jobsPath)) {
            await this.loadTemplatesFromJobDirs(jobsPath);
        }
        await this.loadConstantsFromDir(this.projectRoot);
    }
    async loadTemplatesFromDir(dir) {
        const templateFiles = await this.findTemplateFiles(dir);
        for (const filePath of templateFiles) {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const template = (0, parsers_1.parseTemplate)(content);
                template._path = filePath;
                this.templates.set(template.name, template);
            }
            catch (error) {
                if (error instanceof Error && (error.message.startsWith('Failed to parse template YAML:') || error.message.startsWith('Invalid template'))) {
                    throw new Error(`Template load error in ${filePath}: ${error.message}`);
                }
                if (error instanceof Error && error.code) {
                    throw new Error(`Failed to read template file ${filePath}: ${error.code} ${error.message}`);
                }
                throw error;
            }
        }
    }
    async findTemplateFiles(dir, ignoreDirs = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])) {
        let results = [];
        try {
            const list = await fs.readdir(dir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.resolve(dir, dirent.name);
                if (dirent.isDirectory()) {
                    if (!ignoreDirs.has(dirent.name)) {
                        results = results.concat(await this.findTemplateFiles(fullPath, ignoreDirs));
                    }
                }
                else if (dirent.isFile() && (dirent.name.endsWith('.yaml') || dirent.name.endsWith('.yml'))) {
                    results.push(fullPath);
                }
            }
        }
        catch (err) {
        }
        return results;
    }
    async loadJobsFromDir(dir) {
        const jobFiles = await this.findJobFiles(dir);
        for (const filePath of jobFiles) {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const raw = (() => { try {
                    return require('yaml').parse(content);
                }
                catch {
                    return {};
                } })();
                if (raw && typeof raw === 'object' && raw.type === 'template') {
                    const template = (0, parsers_1.parseTemplate)(content);
                    template._path = filePath;
                    this.templates.set(template.name, template);
                    continue;
                }
                const job = (0, parsers_1.parseJob)(content);
                job._path = filePath;
                this.jobs.set(job.name, job);
            }
            catch (error) {
                if (error instanceof Error && (error.message.startsWith('Failed to parse job YAML:') || error.message.startsWith('Invalid job'))) {
                    console.warn(`Skipping malformed job at ${filePath}: ${error.message}`);
                    continue;
                }
                if (error instanceof Error && error.code) {
                    throw new Error(`Failed to read job file ${filePath}: ${error.code} ${error.message}`);
                }
                throw error;
            }
        }
    }
    async findJobFiles(dir, ignoreDirs = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])) {
        let results = [];
        try {
            const list = await fs.readdir(dir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.resolve(dir, dirent.name);
                if (dirent.isDirectory()) {
                    if (!ignoreDirs.has(dirent.name)) {
                        results = results.concat(await this.findJobFiles(fullPath, ignoreDirs));
                    }
                }
                else if (dirent.isFile() && (dirent.name.endsWith('.yaml') || dirent.name.endsWith('.yml'))) {
                    results.push(fullPath);
                }
            }
        }
        catch (err) {
        }
        return results;
    }
    async loadTemplatesFromJobDirs(jobsRootDir) {
        await this.findAndLoadTemplatesInJobDirs(jobsRootDir);
    }
    async findAndLoadTemplatesInJobDirs(dir, ignoreDirs = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])) {
        try {
            const list = await fs.readdir(dir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.resolve(dir, dirent.name);
                if (dirent.isDirectory()) {
                    if (!ignoreDirs.has(dirent.name)) {
                        if (dirent.name === 'templates') {
                            await this.loadTemplatesFromDir(fullPath);
                        }
                        await this.findAndLoadTemplatesInJobDirs(fullPath, ignoreDirs);
                    }
                }
            }
        }
        catch (err) {
        }
    }
    async loadConstantsFromDir(dir, ignoreDirs = new Set(['node_modules', 'dist', '.git', '.idea', '.vscode'])) {
        try {
            const list = await fs.readdir(dir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.resolve(dir, dirent.name);
                if (dirent.isDirectory()) {
                    if (!ignoreDirs.has(dirent.name)) {
                        await this.loadConstantsFromDir(fullPath, ignoreDirs);
                    }
                }
                else if (dirent.isFile() && (dirent.name.endsWith('.yaml') || dirent.name.endsWith('.yml'))) {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const constantsDoc = (0, constants_1.parseConstants)(content);
                        if (constantsDoc) {
                            for (const [key, value] of Object.entries(constantsDoc.constants)) {
                                if (this.constants.has(key)) {
                                    const prevSource = this.constantSources.get(key);
                                    throw new Error(`Duplicate constant "${key}" found in ${fullPath}${prevSource ? ` (previously defined in ${prevSource})` : ''}`);
                                }
                                this.constants.set(key, value);
                                this.constantSources.set(key, fullPath);
                            }
                        }
                    }
                    catch (err) {
                        if (err instanceof Error && (err.message.startsWith('Failed to parse constants YAML:') || err.message.startsWith('Invalid constants'))) {
                            throw new Error(`Constants load error in ${fullPath}: ${err.message}`);
                        }
                    }
                }
            }
        }
        catch (err) {
        }
    }
    async pathExists(p) {
        try {
            await fs.access(p);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.ProjectLoader = ProjectLoader;
//# sourceMappingURL=loader.js.map