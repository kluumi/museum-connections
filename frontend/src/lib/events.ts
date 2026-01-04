// Type-safe event bus for cross-component communication

import type { NodeId, StopReason } from "@/constants";
import type { PeerMetrics } from "@/types";

// Event map defining all possible events and their payloads
// Using type with index signature to satisfy Record constraint
export type EventMap = {
  [key: string]: object;
  // Signaling events
  "signaling:connected": { nodeId: NodeId };
  "signaling:disconnected": { nodeId: NodeId };
  "signaling:reconnecting": { nodeId: NodeId; attempt: number; delay: number };
  "signaling:error": { nodeId: NodeId; error: Error };
  "signaling:blocked": { nodeId: NodeId; reason: string; message: string };

  // Stream events
  "stream:started": { nodeId: NodeId };
  "stream:stopped": { nodeId: NodeId; reason: StopReason };
  "stream:restored": { nodeId: NodeId };

  // Peer connection events
  "peer:connected": { localNodeId: NodeId; remoteNodeId: NodeId };
  "peer:disconnected": { localNodeId: NodeId; remoteNodeId: NodeId };
  "peer:failed": { localNodeId: NodeId; remoteNodeId: NodeId; error: Error };
  "peer:reconnecting": {
    localNodeId: NodeId;
    remoteNodeId: NodeId;
    attempt: number;
  };

  // Metrics events
  "metrics:update": { nodeId: NodeId; peerId: NodeId; metrics: PeerMetrics };

  // Media events
  "media:track-added": { nodeId: NodeId; track: MediaStreamTrack };
  "media:track-removed": { nodeId: NodeId; track: MediaStreamTrack };
  "media:device-changed": { devices: MediaDeviceInfo[] };
};

type EventHandler<T> = (data: T) => void;
type Unsubscribe = () => void;

/**
 * Type-safe event emitter for application-wide events
 */
class TypedEventEmitter<T extends Record<string, unknown>> {
  private listeners = new Map<keyof T, Set<EventHandler<unknown>>>();

  /**
   * Subscribe to an event
   */
  on<K extends keyof T>(event: K, handler: EventHandler<T[K]>): Unsubscribe {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler as EventHandler<unknown>);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Subscribe to an event, but only fire once
   */
  once<K extends keyof T>(event: K, handler: EventHandler<T[K]>): Unsubscribe {
    const unsubscribe = this.on(event, (data) => {
      unsubscribe();
      handler(data);
    });
    return unsubscribe;
  }

  /**
   * Emit an event to all subscribers
   */
  emit<K extends keyof T>(event: K, data: T[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error);
        }
      }
    }
  }

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   */
  off<K extends keyof T>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount<K extends keyof T>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

// Singleton event bus instance
export const eventBus = new TypedEventEmitter<EventMap>();

// Export the class for testing or creating isolated instances
export { TypedEventEmitter };
