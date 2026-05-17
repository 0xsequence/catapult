export interface Network {
    name: string;
    chainId: number;
    rpcUrl: string;
    supports?: string[];
    gasLimit?: number;
    testnet?: boolean;
    evmVersion?: string;
    params?: Record<string, unknown>;
}
//# sourceMappingURL=network.d.ts.map