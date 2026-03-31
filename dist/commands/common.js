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
exports.verbosityOption = exports.noStdOption = exports.dotenvOption = exports.projectOption = void 0;
exports.loadProject = loadProject;
exports.loadDotenv = loadDotenv;
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const loader_1 = require("../lib/core/loader");
const events_1 = require("../lib/events");
const projectOption = (cmd) => cmd.option('-p, --project <path>', 'Project root directory', process.cwd());
exports.projectOption = projectOption;
const dotenvOption = (cmd) => cmd.option('--dotenv <path>', 'Path to a custom .env file');
exports.dotenvOption = dotenvOption;
const noStdOption = (cmd) => cmd.option('--no-std', 'Disable loading built-in standard templates');
exports.noStdOption = noStdOption;
const verbosityOption = (cmd) => cmd.option('-v, --verbose', 'Enable verbose logging (use -vv or -vvv for more detail)', (_, previous) => (previous || 0) + 1, 0);
exports.verbosityOption = verbosityOption;
async function loadProject(projectRoot, options) {
    events_1.deploymentEvents.emitEvent({
        type: 'project_loading_started',
        level: 'info',
        data: { projectRoot }
    });
    const loader = new loader_1.ProjectLoader(projectRoot, options);
    await loader.load();
    events_1.deploymentEvents.emitEvent({
        type: 'project_loaded',
        level: 'info',
        data: {
            jobCount: loader.jobs.size,
            templateCount: loader.templates.size
        }
    });
    return loader;
}
function loadDotenv(options) {
    const dotenvPath = options.dotenv ? path.resolve(options.dotenv) : path.resolve(process.cwd(), '.env');
    dotenv.config({ path: dotenvPath });
}
//# sourceMappingURL=common.js.map