"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupCommands = setupCommands;
const commands_1 = require("./commands");
const etherscan_1 = require("./commands/etherscan");
function setupCommands(program) {
    program.addCommand((0, commands_1.makeRunCommand)(), {
        isDefault: true,
        hidden: false
    });
    program.addCommand((0, commands_1.makeDryRunCommand)());
    program.addCommand((0, commands_1.makeListCommand)());
    program.addCommand((0, commands_1.makeUtilsCommand)());
    program.addCommand((0, etherscan_1.makeEtherscanCommand)());
}
//# sourceMappingURL=cli.js.map