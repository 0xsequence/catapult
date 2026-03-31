"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploymentEvents = exports.DeploymentEventEmitter = void 0;
const events_1 = require("events");
class DeploymentEventEmitter extends events_1.EventEmitter {
    emitEvent(event) {
        const fullEvent = {
            ...event,
            timestamp: new Date()
        };
        this.emit(event.type, fullEvent);
        this.emit('event', fullEvent);
    }
    onEvent(eventType, listener) {
        return this.on(eventType, listener);
    }
    onAnyEvent(listener) {
        return this.on('event', listener);
    }
    onceEvent(eventType, listener) {
        return this.once(eventType, listener);
    }
    offEvent(eventType, listener) {
        return this.off(eventType, listener);
    }
}
exports.DeploymentEventEmitter = DeploymentEventEmitter;
exports.deploymentEvents = new DeploymentEventEmitter();
//# sourceMappingURL=emitter.js.map