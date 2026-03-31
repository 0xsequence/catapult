"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBuildInfo = parseBuildInfo;
exports.isBuildInfoFile = isBuildInfoFile;
exports.extractedContractToArtifact = extractedContractToArtifact;
function isValidBuildInfo(data) {
    return (data &&
        typeof data === 'object' &&
        (data._format === undefined || data._format === 'hh-sol-build-info-1' || data._format === 'ethers-rs-sol-build-info-1') &&
        typeof data.id === 'string' &&
        typeof data.solcVersion === 'string' &&
        (data.solcLongVersion === undefined || typeof data.solcLongVersion === 'string') &&
        data.input &&
        typeof data.input === 'object' &&
        data.output &&
        typeof data.output === 'object' &&
        data.output.contracts &&
        typeof data.output.contracts === 'object');
}
function parseBuildInfo(content, filePath) {
    try {
        const data = JSON.parse(content);
        if (!isValidBuildInfo(data)) {
            return null;
        }
        const extractedContracts = [];
        for (const [sourceName, sourceContracts] of Object.entries(data.output.contracts)) {
            for (const [contractName, contractData] of Object.entries(sourceContracts)) {
                if (!contractData.abi || !Array.isArray(contractData.abi)) {
                    continue;
                }
                if (!contractData.evm?.bytecode?.object ||
                    (!contractData.evm.bytecode.object.startsWith('0x') && !/^[0-9a-fA-F]+$/.test(contractData.evm.bytecode.object))) {
                    continue;
                }
                const sourceContent = data.input.sources[sourceName]?.content;
                const bytecode = contractData.evm.bytecode.object.startsWith('0x')
                    ? contractData.evm.bytecode.object
                    : '0x' + contractData.evm.bytecode.object;
                const deployedBytecode = contractData.evm.deployedBytecode?.object
                    ? (contractData.evm.deployedBytecode.object.startsWith('0x')
                        ? contractData.evm.deployedBytecode.object
                        : '0x' + contractData.evm.deployedBytecode.object)
                    : undefined;
                const extractedContract = {
                    contractName,
                    sourceName,
                    fullyQualifiedName: `${sourceName}:${contractName}`,
                    abi: contractData.abi,
                    bytecode,
                    deployedBytecode,
                    source: sourceContent,
                    compiler: {
                        version: data.solcLongVersion || data.solcVersion
                    },
                    buildInfoId: data.id,
                    buildInfoPath: filePath
                };
                extractedContracts.push(extractedContract);
            }
        }
        return extractedContracts.length > 0 ? extractedContracts : null;
    }
    catch (error) {
        return null;
    }
}
function isBuildInfoFile(filePath) {
    if (filePath.includes('/build-info/') && filePath.endsWith('.json')) {
        return true;
    }
    return false;
}
function extractedContractToArtifact(extracted) {
    return {
        contractName: extracted.contractName,
        abi: extracted.abi,
        bytecode: extracted.bytecode,
        deployedBytecode: extracted.deployedBytecode,
        sourceName: extracted.sourceName,
        source: extracted.source,
        compiler: extracted.compiler
    };
}
//# sourceMappingURL=buildinfo.js.map