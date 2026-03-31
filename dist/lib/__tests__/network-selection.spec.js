"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const network_selection_1 = require("../../lib/network-selection");
describe('network-selection', () => {
    const networks = [
        { name: 'Mainnet', chainId: 1, rpcUrl: 'https://mainnet' },
        { name: 'Arbitrum One', chainId: 42161, rpcUrl: 'https://arb' },
        { name: 'Polygon', chainId: 137, rpcUrl: 'https://polygon' },
        { name: 'Mainnet', chainId: 10000, rpcUrl: 'https://fork' },
    ];
    it('returns undefined for empty/undefined input', () => {
        expect((0, network_selection_1.resolveSelectedChainIds)(undefined, networks)).toBeUndefined();
        expect((0, network_selection_1.resolveSelectedChainIds)('', networks)).toBeUndefined();
        expect((0, network_selection_1.resolveSelectedChainIds)('   ', networks)).toBeUndefined();
    });
    it('parses numeric IDs and removes duplicates', () => {
        expect((0, network_selection_1.resolveSelectedChainIds)('1,1,42161', networks)).toEqual([1, 42161]);
    });
    it('matches names case-insensitively and includes all with same name', () => {
        expect((0, network_selection_1.resolveSelectedChainIds)('mainnet', networks)).toEqual([1, 10000]);
        expect((0, network_selection_1.resolveSelectedChainIds)('MAINNET,polygon', networks)).toEqual([1, 10000, 137]);
    });
    it('preserves token order and then network order for name matches', () => {
        expect((0, network_selection_1.resolveSelectedChainIds)('polygon,mainnet', networks)).toEqual([137, 1, 10000]);
    });
    it('throws on unknown name', () => {
        expect(() => (0, network_selection_1.resolveSelectedChainIds)('unknown', networks)).toThrow(/Unknown network selector/);
    });
    it('resolveSingleChainId returns first match for name and first token for multi', () => {
        expect((0, network_selection_1.resolveSingleChainId)('mainnet', networks)).toBe(1);
        expect((0, network_selection_1.resolveSingleChainId)('137,1', networks)).toBe(137);
    });
});
//# sourceMappingURL=network-selection.spec.js.map