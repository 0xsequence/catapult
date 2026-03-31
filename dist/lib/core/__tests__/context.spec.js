"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const context_1 = require("../context");
describe('ExecutionContext', () => {
    const network = {
        name: 'test',
        chainId: 31337,
        rpcUrl: 'http://127.0.0.1:8545'
    };
    const contractRepository = {};
    it('wraps private-key signers in a NonceManager', async () => {
        const context = new context_1.ExecutionContext(network, '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', contractRepository);
        const signer = await context.getResolvedSigner();
        expect(signer).toBeInstanceOf(ethers_1.ethers.NonceManager);
    });
    it('wraps promised signers in a NonceManager when first resolved', async () => {
        const getSignerSpy = jest.spyOn(ethers_1.ethers.JsonRpcProvider.prototype, 'getSigner');
        getSignerSpy.mockResolvedValue(ethers_1.ethers.Wallet.createRandom().connect(new ethers_1.ethers.JsonRpcProvider(network.rpcUrl)));
        const context = new context_1.ExecutionContext(network, undefined, contractRepository);
        await expect(context.getResolvedSigner()).resolves.toBeInstanceOf(ethers_1.ethers.NonceManager);
        getSignerSpy.mockRestore();
    });
});
//# sourceMappingURL=context.spec.js.map