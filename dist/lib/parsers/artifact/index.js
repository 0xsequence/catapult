"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArtifact = parseArtifact;
const foundry_1_2_1 = require("./foundry-1.2");
const parsers = [
    foundry_1_2_1.foundry12Parser,
];
function parseArtifact(content, filePath) {
    for (const parser of parsers) {
        const result = parser(content, filePath);
        if (result) {
            return result;
        }
    }
    return null;
}
//# sourceMappingURL=index.js.map