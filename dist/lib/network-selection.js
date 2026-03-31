"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSelectedChainIds = resolveSelectedChainIds;
exports.resolveSingleChainId = resolveSingleChainId;
function resolveSelectedChainIds(selectors, networks) {
    if (selectors == null)
        return undefined;
    const normalized = String(selectors).trim();
    if (normalized.length === 0)
        return undefined;
    const tokens = normalized
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);
    if (tokens.length === 0)
        return undefined;
    const result = [];
    const seen = new Set();
    for (const token of tokens) {
        if (/^\d+$/.test(token)) {
            const id = Number(token);
            if (!seen.has(id)) {
                seen.add(id);
                result.push(id);
            }
            continue;
        }
        const tokenLc = token.toLowerCase();
        const matches = networks.filter(n => n.name.toLowerCase() === tokenLc);
        if (matches.length === 0) {
            const available = Array.from(new Set(networks.map(n => n.name))).sort();
            throw new Error(`Unknown network selector "${token}". Use a chain ID (e.g., 1) or a network name. Available names: ${available.join(', ')}`);
        }
        for (const net of matches) {
            if (!seen.has(net.chainId)) {
                seen.add(net.chainId);
                result.push(net.chainId);
            }
        }
    }
    return result;
}
function resolveSingleChainId(selector, networks) {
    const ids = resolveSelectedChainIds(selector, networks);
    if (!ids || ids.length === 0)
        return undefined;
    return ids[0];
}
//# sourceMappingURL=network-selection.js.map