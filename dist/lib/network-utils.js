"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectNetworkFromRpc = detectNetworkFromRpc;
exports.isValidRpcUrl = isValidRpcUrl;
const ethers_1 = require("ethers");
async function detectNetworkFromRpc(rpcUrl) {
    try {
        const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
        const network = await provider.getNetwork();
        return {
            name: network.name,
            chainId: Number(network.chainId),
            rpcUrl: rpcUrl
        };
    }
    catch (error) {
        throw new Error(`Failed to detect network from RPC URL "${rpcUrl}": ${error instanceof Error ? error.message : String(error)}`);
    }
}
function isValidRpcUrl(url) {
    try {
        const urlObj = new URL(url);
        const isValidProtocol = urlObj.protocol === 'http:' ||
            urlObj.protocol === 'https:' ||
            url.startsWith('ws://') ||
            url.startsWith('wss://');
        if (!isValidProtocol) {
            return false;
        }
        if (!urlObj.hostname) {
            return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=network-utils.js.map