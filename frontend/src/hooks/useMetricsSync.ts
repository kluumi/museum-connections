// Syncs eventBus metrics events to Zustand store
// Must be used once at app root level

import { useEffect } from "react";
import { eventBus } from "@/lib/events";
import { useStore } from "@/stores";

/**
 * Listens to metrics:update events from WebRTCService and updates the store.
 * Call this hook once in your root layout.
 */
export function useMetricsSync(): void {
  // Get action directly from store - Zustand actions are stable and don't change
  // Don't include in dependency array to avoid subscription thrashing
  useEffect(() => {
    const unsubscribe = eventBus.on("metrics:update", ({ peerId, metrics }) => {
      // Access store action directly to avoid dependency issues
      useStore.getState().updatePeerMetrics(peerId, metrics);
    });

    return unsubscribe;
  }, []); // Empty deps - action is stable
}
