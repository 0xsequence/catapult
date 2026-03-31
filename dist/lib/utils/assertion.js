"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAddress = isAddress;
exports.isBytesLike = isBytesLike;
exports.isBigNumberish = isBigNumberish;
const ethers_1 = require("ethers");
function isAddress(value) {
    return ethers_1.ethers.isAddress(value);
}
function isBytesLike(value) {
    return ethers_1.ethers.isBytesLike(value);
}
function isBigNumberish(value) {
    try {
        switch (typeof (value)) {
            case "bigint":
            case "number":
            case "string":
                ethers_1.ethers.toBigInt(value);
                return true;
        }
    }
    catch (error) {
    }
    return false;
}
//# sourceMappingURL=assertion.js.map