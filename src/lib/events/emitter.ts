import { EventEmitter } from 'events'
import { DeploymentEvent } from '../types/events'

/**
 * Type-safe event emitter for deployment events.
 * Extends Node.js EventEmitter with typed event methods.
 */
export class DeploymentEventEmitter extends EventEmitter {
  /**
   * Emits a deployment event with automatic timestamp injection.
   */
  public emitEvent(event: any): void {
    const fullEvent = {
      ...event,
      timestamp: new Date()
    }

    // Emit on both the specific event type and a general 'event' channel
    this.emit(event.type, fullEvent)
    this.emit('event', fullEvent)
  }

  /**
   * Type-safe event listener registration.
   */
  public onEvent<T extends DeploymentEvent>(
    eventType: T['type'],
    listener: (event: T) => void
  ): this {
    return this.on(eventType, listener)
  }

  /**
   * Listen to all events.
   */
  public onAnyEvent(listener: (event: DeploymentEvent) => void): this {
    return this.on('event', listener)
  }

  /**
   * One-time event listener.
   */
  public onceEvent<T extends DeploymentEvent>(
    eventType: T['type'],
    listener: (event: T) => void
  ): this {
    return this.once(eventType, listener)
  }

  /**
   * Remove event listener.
   */
  public offEvent<T extends DeploymentEvent>(
    eventType: T['type'],
    listener: (event: T) => void
  ): this {
    return this.off(eventType, listener)
  }
}

// Singleton instance for global access
export const deploymentEvents = new DeploymentEventEmitter() 