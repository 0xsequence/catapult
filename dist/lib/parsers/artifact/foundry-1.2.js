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
exports.foundry12Parser = void 0;
const path = __importStar(require("path"));
const foundry12Parser = (content, filePath) => {
    try {
        const json = JSON.parse(content);
        if (typeof json === 'object' &&
            json !== null &&
            Array.isArray(json.abi) &&
            (typeof json.bytecode === 'string' || (typeof json.bytecode === 'object' && typeof json.bytecode.object === 'string'))) {
            const bytecode = typeof json.bytecode === 'object' ? json.bytecode.object : json.bytecode;
            if (!bytecode || !bytecode.startsWith('0x')) {
                return null;
            }
            const deployedBytecode = typeof json.deployedBytecode === 'object' ? json.deployedBytecode?.object : json.deployedBytecode;
            let contractName = json.contractName;
            if (!contractName && filePath) {
                const basename = path.basename(filePath, '.json');
                contractName = basename;
            }
            if (!contractName && json.metadata?.settings?.compilationTarget) {
                const compilationTarget = json.metadata.settings.compilationTarget;
                const contractNames = Object.values(compilationTarget);
                if (contractNames.length > 0) {
                    contractName = contractNames[0];
                }
            }
            if (!contractName) {
                return null;
            }
            return {
                contractName: contractName,
                sourceName: json.sourceName,
                abi: json.abi,
                bytecode: bytecode,
                deployedBytecode: deployedBytecode,
                compiler: json.compiler,
                source: json.source,
            };
        }
        return null;
    }
    catch (error) {
        return null;
    }
};
exports.foundry12Parser = foundry12Parser;
//# sourceMappingURL=foundry-1.2.js.map