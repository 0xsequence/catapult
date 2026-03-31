#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setVerbosity = setVerbosity;
const commander_1 = require("commander");
const cli_1 = require("./cli");
const package_json_1 = __importDefault(require("../package.json"));
const events_1 = require("./lib/events");
const cliAdapter = new events_1.CLIEventAdapter(events_1.deploymentEvents);
function setVerbosity(level) {
    cliAdapter.setVerbosity(level);
}
process.on('unhandledRejection', (reason, promise) => {
    events_1.deploymentEvents.emitEvent({
        type: 'unhandled_rejection',
        level: 'error',
        data: {
            reason,
            promise
        }
    });
    process.exit(1);
});
process.on('uncaughtException', (error) => {
    events_1.deploymentEvents.emitEvent({
        type: 'uncaught_exception',
        level: 'error',
        data: {
            error
        }
    });
    process.exit(1);
});
async function main() {
    try {
        commander_1.program
            .name('catapult')
            .description('Ethereum contract deployment CLI tool')
            .version(package_json_1.default.version);
        (0, cli_1.setupCommands)(commander_1.program);
        await commander_1.program.parseAsync(process.argv);
    }
    catch (error) {
        events_1.deploymentEvents.emitEvent({
            type: 'cli_error',
            level: 'error',
            data: {
                message: error instanceof Error ? error.message : String(error)
            }
        });
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map