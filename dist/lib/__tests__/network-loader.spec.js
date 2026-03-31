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
const path = __importStar(require("path"));
const network_loader_1 = require("../network-loader");
const tmpDir = path.join(process.cwd(), '.tmp-network-loader-tests');
async function writeNetworksYaml(projectRoot, yamlContent) {
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.writeFile(path.join(projectRoot, 'networks.yaml'), yamlContent, 'utf-8');
}
describe('network-loader rpcUrl token replacement', () => {
    const originalEnv = { ...process.env };
    beforeAll(async () => {
        await fs.mkdir(tmpDir, { recursive: true });
    });
    afterEach(() => {
        process.env = { ...originalEnv };
    });
    afterAll(async () => {
        try {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
        catch { }
    });
    test('replaces {{RPC_*}} tokens with env values', async () => {
        const projectRoot = path.join(tmpDir, 'case1');
        process.env.RPC_URL_TOKEN = 'abc123';
        const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{RPC_URL_TOKEN}}"
`;
        await writeNetworksYaml(projectRoot, yaml);
        const networks = await (0, network_loader_1.loadNetworks)(projectRoot);
        expect(networks).toHaveLength(1);
        expect(networks[0].rpcUrl).toBe('https://node.example.com/abc123');
    });
    test('leaves non-RPC tokens intact', async () => {
        const projectRoot = path.join(tmpDir, 'case2');
        process.env.SOME_TOKEN = 'should_not_be_used';
        const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{SOME_TOKEN}}"
`;
        await writeNetworksYaml(projectRoot, yaml);
        const networks = await (0, network_loader_1.loadNetworks)(projectRoot);
        expect(networks[0].rpcUrl).toBe('https://node.example.com/{{SOME_TOKEN}}');
    });
    test('supports multiple RPC tokens in a single url', async () => {
        const projectRoot = path.join(tmpDir, 'case3');
        process.env.RPC_A = 'A';
        process.env.RPC_B = 'B';
        const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{RPC_A}}/path/{{RPC_B}}"
`;
        await writeNetworksYaml(projectRoot, yaml);
        const networks = await (0, network_loader_1.loadNetworks)(projectRoot);
        expect(networks[0].rpcUrl).toBe('https://node.example.com/A/path/B');
    });
    test('trims whitespace within tokens', async () => {
        const projectRoot = path.join(tmpDir, 'case4');
        process.env.RPC_TOKEN = 'XYZ';
        const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{  RPC_TOKEN   }}"
`;
        await writeNetworksYaml(projectRoot, yaml);
        const networks = await (0, network_loader_1.loadNetworks)(projectRoot);
        expect(networks[0].rpcUrl).toBe('https://node.example.com/XYZ');
    });
    test('defaults to empty string when RPC token has no matching env var', async () => {
        const projectRoot = path.join(tmpDir, 'case5');
        delete process.env.RPC_MISSING;
        const yaml = `
- name: "TestNet"
  chainId: 123
  rpcUrl: "https://node.example.com/{{RPC_MISSING}}"
`;
        await writeNetworksYaml(projectRoot, yaml);
        const networks = await (0, network_loader_1.loadNetworks)(projectRoot);
        expect(networks[0].rpcUrl).toBe('https://node.example.com/');
    });
});
//# sourceMappingURL=network-loader.spec.js.map