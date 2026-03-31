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
exports.loadNetworks = loadNetworks;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const yaml_1 = require("yaml");
function isValidNetwork(obj) {
    return (typeof obj === 'object' &&
        obj !== null &&
        'name' in obj &&
        'chainId' in obj &&
        'rpcUrl' in obj &&
        typeof obj.name === 'string' &&
        typeof obj.chainId === 'number' &&
        typeof obj.rpcUrl === 'string' &&
        (!('supports' in obj) ||
            (Array.isArray(obj.supports) &&
                obj.supports.every((item) => typeof item === 'string'))) &&
        (!('gasLimit' in obj) || typeof obj.gasLimit === 'number') &&
        (!('testnet' in obj) || typeof obj.testnet === 'boolean') &&
        (!('evmVersion' in obj) || typeof obj.evmVersion === 'string'));
}
function resolveRpcUrlTokens(rpcUrl) {
    const TOKEN_REGEX = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    return rpcUrl.replace(TOKEN_REGEX, (match, varName) => {
        if (!varName.startsWith('RPC')) {
            return match;
        }
        const value = process.env[varName];
        if (typeof value === 'undefined') {
            return '';
        }
        return value;
    });
}
async function loadNetworks(projectRoot) {
    const filePath = path.join(projectRoot, 'networks.yaml');
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = (0, yaml_1.parse)(content);
        if (!Array.isArray(parsed)) {
            throw new Error('networks.yaml must contain an array of network configurations.');
        }
        const networks = [];
        for (const item of parsed) {
            if (!isValidNetwork(item)) {
                throw new Error(`Invalid network configuration found in networks.yaml: ${JSON.stringify(item)}`);
            }
            const resolvedRpcUrl = resolveRpcUrlTokens(item.rpcUrl);
            networks.push({ ...item, rpcUrl: resolvedRpcUrl });
        }
        return networks;
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error) {
            const errWithCode = error;
            if (errWithCode.code === 'ENOENT') {
                return [];
            }
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load or parse networks.yaml: ${message}`);
    }
}
//# sourceMappingURL=network-loader.js.map