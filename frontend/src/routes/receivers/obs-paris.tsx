import { createFileRoute } from "@tanstack/react-router";
import { MonitorOff, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { FullscreenVideo } from "@/components/receiver";
import { Button } from "@/components/ui/button";
import { ConnectionState } from "@/constants/connection-states";
import {
  getNodeDisplayName,
  NodeId,
  RECEIVER_SOURCE,
} from "@/constants/node-ids";
import { useSignaling } from "@/hooks/useSignaling";
import { useWebRTC } from "@/hooks/useWebRTC";

export const Route = createFileRoute("/receivers/obs-paris")({
  component: ObsParisReceiver,
});

// Retry interval for requesting offers (5 seconds)
const OFFER_RETRY_INTERVAL = 5000;

function ObsParisReceiver() {
  const nodeId = NodeId.OBS_PARIS;
  const sourceId = RECEIVER_SOURCE[nodeId]; // "nantes"
  const displayName = getNodeDisplayName(nodeId);

  const webrtcRef = useRef<ReturnType<typeof useWebRTC> | null>(null);
  const hasRequestedOffer = useRef(false);

  // Connect to signaling server
  const signaling = useSignaling(nodeId, {
    autoConnect: true,
    onMessage: (message) => {
      const webrtc = webrtcRef.current;
      if (!webrtc) return;

      // Only handle messages from our source
      if (message.from !== sourceId) return;

      switch (message.type) {
        case "offer":
          // Ignore offers if already connected
          if (webrtc.connectionState === ConnectionState.CONNECTED) {
            console.log("📩 Ignoring offer - already connected");
            return;
          }
          console.log("📩 Received offer from", sourceId);
          webrtc.handleOffer(message.offer).catch((error) => {
            console.error("❌ Failed to handle offer:", error);
            // Reset state so we can try again
            hasRequestedOffer.current = false;
          });
          break;

        case "candidate":
          webrtc.addIceCandidate(message.candidate).catch((error) => {
            console.warn("⚠️ Failed to add ICE candidate:", error);
          });
          break;

        case "stream_started":
        case "page_opened":
          // Source is ready, request offer if not connected
          if (webrtc.connectionState !== ConnectionState.CONNECTED) {
            console.log("📡 Source ready, requesting offer");
            signaling.requestOffer(sourceId);
          }
          break;
      }
    },
  });

  // WebRTC connection to receive from source
  const webrtc = useWebRTC(nodeId, sourceId, signaling.service, {});

  // Keep ref updated
  webrtcRef.current = webrtc;

  // Request offer once when source becomes available
  useEffect(() => {
    if (!signaling.isConnected) return;

    const sourceConnected = signaling.connectedPeers.includes(sourceId);
    const isConnected = webrtc.connectionState === ConnectionState.CONNECTED;
    const isConnecting = webrtc.connectionState === ConnectionState.CONNECTING;

    // Don't request if already connected or connecting
    if (isConnected || isConnecting) {
      hasRequestedOffer.current = false; // Reset for next disconnect
      return;
    }

    // Request offer if source is available and we haven't requested yet
    if (sourceConnected && !hasRequestedOffer.current) {
      console.log("📡 Requesting offer from", sourceId);
      signaling.requestOffer(sourceId);
      hasRequestedOffer.current = true;
    }
  }, [
    signaling.isConnected,
    signaling.connectedPeers,
    signaling.requestOffer,
    webrtc.connectionState,
    sourceId,
  ]);

  // Periodic retry only when disconnected for a while
  useEffect(() => {
    if (!signaling.isConnected) return;

    const sourceConnected = signaling.connectedPeers.includes(sourceId);
    const isConnected = webrtc.connectionState === ConnectionState.CONNECTED;
    const isConnecting = webrtc.connectionState === ConnectionState.CONNECTING;

    // Only retry if source is available but we're not connected/connecting
    if (!sourceConnected || isConnected || isConnecting) {
      return;
    }

    const interval = setInterval(() => {
      const currentState = webrtcRef.current?.connectionState;
      if (
        currentState !== ConnectionState.CONNECTED &&
        currentState !== ConnectionState.CONNECTING
      ) {
        console.log("📡 Retrying offer request to", sourceId);
        signaling.requestOffer(sourceId);
      }
    }, OFFER_RETRY_INTERVAL);

    return () => clearInterval(interval);
  }, [
    signaling.isConnected,
    signaling.connectedPeers,
    signaling.requestOffer,
    webrtc.connectionState,
    sourceId,
  ]);

  // Show blocking overlay if duplicate OBS receiver detected
  if (signaling.blockedMessage) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <MonitorOff className="h-10 w-10 text-destructive" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-destructive">
              {displayName} déjà actif
            </h1>
            <p className="text-muted-foreground">{signaling.blockedMessage}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Fermez cet onglet et utilisez l'onglet existant, ou fermez l'autre
            onglet puis rafraîchissez cette page.
          </p>
          <Button
            variant="outline"
            className="text-foreground"
            onClick={() => window.location.reload()}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Rafraîchir la page
          </Button>
        </div>
      </div>
    );
  }

  return <FullscreenVideo stream={webrtc.remoteStream} />;
}
