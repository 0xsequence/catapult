import { EventEmitter } from 'events';
import { DeploymentEvent } from './types';
export declare class DeploymentEventEmitter extends EventEmitter {
    emitEvent(event: any): void;
    onEvent<T extends DeploymentEvent>(eventType: T['type'], listener: (event: T) => void): this;
    onAnyEvent(listener: (event: DeploymentEvent) => void): this;
    onceEvent<T extends DeploymentEvent>(eventType: T['type'], listener: (event: T) => void): this;
    offEvent<T extends DeploymentEvent>(eventType: T['type'], listener: (event: T) => void): this;
}
export declare const deploymentEvents: DeploymentEventEmitter;
//# sourceMappingURL=emitter.d.ts.map