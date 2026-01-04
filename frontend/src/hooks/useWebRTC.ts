// useWebRTC - Composition hook for WebRTC peer connections
// Pattern: Composable hooks - combines lower-level hooks

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, type NodeId } from "@/constants";
import { type SignalingService, WebRTCService } from "@/services";
import { useStore } from "@/stores";
import type { PeerMetrics, ServerToClientMessage } from "@/types";

interface UseWebRTCOptions {
  localStream?: MediaStream | null;
  onTrack?: (event: RTCTrackEvent) => void;
  onMetrics?: (metrics: PeerMetrics) => void;
}

/**
 * Hook for managing a WebRTC peer connection
 */
export function useWebRTC(
  localNodeId: NodeId,
  remoteNodeId: NodeId,
  signaling: SignalingService | null,
  options: UseWebRTCOptions = {},
) {
  const { localStream, onTrack, onMetrics } = options;

  const {
    setPeerConnectionState,
    removePeerConnectionState,
    addRemoteStream,
    removeRemoteStream,
    updatePeerMetrics,
    removePeerMetrics,
  } = useStore();

  const serviceRef = useRef<WebRTCService | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED,
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Keep options refs updated
  const onTrackRef = useRef(onTrack);
  const onMetricsRef = useRef(onMetrics);
  useEffect(() => {
    onTrackRef.current = onTrack;
    onMetricsRef.current = onMetrics;
  }, [onTrack, onMetrics]);

  // Store localStream in ref to pass initial value without causing re-creation
  const localStreamRef = useRef(localStream);
  localStreamRef.current = localStream;

  // Initialize WebRTC service when signaling is ready
  // IMPORTANT: localStream is NOT in the dependency array to avoid recreating the service
  // when the stream changes. Use replaceTrack() or setLocalStream() instead.
  useEffect(() => {
    if (!signaling) return;

    serviceRef.current = new WebRTCService(
      localNodeId,
      remoteNodeId,
      signaling,
      {
        localStream: localStreamRef.current ?? undefined,
        onTrack: (event) => {
          // ALWAYS create a fresh MediaStream to ensure React detects the state change
          // This fixes ISSUE-003: video not displaying after sender page refresh
          // When sender refreshes, WebRTCService reinitializes and we may receive
          // the same stream object reference - React won't see it as a change
          const newStream = new MediaStream();
          if (event.streams[0]) {
            // Copy tracks from the incoming stream
            for (const track of event.streams[0].getTracks()) {
              newStream.addTrack(track);
            }
            console.log(
              `🎬 Created fresh stream with ${newStream.getTracks().length} tracks for ${remoteNodeId}`,
            );
          } else {
            // No stream in event, just add the single track
            newStream.addTrack(event.track);
            console.log(
              `🎬 Created fresh stream with single ${event.track.kind} track for ${remoteNodeId}`,
            );
          }
          setRemoteStream(newStream);
          addRemoteStream(remoteNodeId, newStream);
          onTrackRef.current?.(event);
        },
        onConnectionStateChange: (state) => {
          setConnectionState(state);
          setPeerConnectionState(remoteNodeId, state);
          // Only clear remote stream when truly disconnected/failed
          // Don't clear on CONNECTING - tracks may arrive before state becomes CONNECTED
          if (
            state === ConnectionState.DISCONNECTED ||
            state === ConnectionState.FAILED
          ) {
            setRemoteStream(null);
            removeRemoteStream(remoteNodeId);
          }
        },
        onMetrics: (metrics) => {
          updatePeerMetrics(remoteNodeId, metrics);
          onMetricsRef.current?.(metrics);
        },
      },
    );

    return () => {
      // Use destroy() instead of close() to clear all handlers
      serviceRef.current?.destroy();
      serviceRef.current = null;
      removePeerConnectionState(remoteNodeId);
      removeRemoteStream(remoteNodeId);
      removePeerMetrics(remoteNodeId);
    };
  }, [
    signaling,
    localNodeId,
    remoteNodeId,
    // NOTE: localStream intentionally omitted - handled via replaceTrack or setLocalStream
    setPeerConnectionState,
    removePeerConnectionState,
    addRemoteStream,
    removeRemoteStream,
    updatePeerMetrics,
    removePeerMetrics,
  ]);

  // Update local stream when it changes
  useEffect(() => {
    if (serviceRef.current && localStream) {
      serviceRef.current.setLocalStream(localStream);
    }
  }, [localStream]);

  // Handle signaling messages for this peer
  const handleSignalingMessage = useCallback(
    async (message: ServerToClientMessage) => {
      if (!serviceRef.current) return;

      // Only handle messages from our remote peer
      if (message.from !== remoteNodeId) return;

      switch (message.type) {
        case "offer":
          await serviceRef.current.handleOffer(message.offer);
          break;

        case "answer":
          await serviceRef.current.handleAnswer(message.answer);
          break;

        case "candidate":
          await serviceRef.current.addIceCandidate(message.candidate);
          break;

        case "request_offer":
          await serviceRef.current.createOffer();
          break;
      }
    },
    [remoteNodeId],
  );

  // Create offer
  const createOffer = useCallback(async () => {
    if (!serviceRef.current) {
      throw new Error("WebRTC service not initialized");
    }
    serviceRef.current.initialize();
    return serviceRef.current.createOffer();
  }, []);

  // Handle incoming offer
  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (!serviceRef.current) {
      throw new Error("WebRTC service not initialized");
    }
    // Note: Don't call initialize() here - handleOffer() already reinitializes internally
    return serviceRef.current.handleOffer(offer);
  }, []);

  // Handle incoming answer
  const handleAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit) => {
      if (!serviceRef.current) {
        throw new Error("WebRTC service not initialized");
      }
      return serviceRef.current.handleAnswer(answer);
    },
    [],
  );

  // Add ICE candidate
  const addIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      if (!serviceRef.current) return;
      return serviceRef.current.addIceCandidate(candidate);
    },
    [],
  );

  // Replace track
  const replaceTrack = useCallback(async (track: MediaStreamTrack) => {
    if (!serviceRef.current) {
      console.warn("⚠️ Cannot replace track: service not initialized");
      return;
    }
    await serviceRef.current.replaceTrack(track);
  }, []);

  // Set video bitrate
  const setVideoBitrate = useCallback(async (maxBitrate: number | "auto") => {
    if (!serviceRef.current) {
      console.warn("⚠️ Cannot set bitrate: service not initialized");
      return false;
    }
    return serviceRef.current.setVideoBitrate(maxBitrate);
  }, []);

  // Set preferred codec
  const setPreferredCodec = useCallback((codec: string | "auto") => {
    if (!serviceRef.current) {
      console.warn("⚠️ Cannot set codec: service not initialized");
      return;
    }
    serviceRef.current.setPreferredCodec(codec);
  }, []);

  // Restart ICE
  const restartIce = useCallback(async () => {
    await serviceRef.current?.restartIce();
  }, []);

  // Close connection
  const close = useCallback(() => {
    serviceRef.current?.close();
    setRemoteStream(null);
  }, []);

  // Set effective remote node ID (for dynamic operator IDs)
  const setEffectiveRemoteNodeId = useCallback((nodeId: NodeId) => {
    serviceRef.current?.setEffectiveRemoteNodeId(nodeId);
  }, []);

  return {
    // State
    connectionState,
    isConnected: connectionState === ConnectionState.CONNECTED,
    remoteStream,

    // Service access
    service: serviceRef.current,

    // Message handler (to be called from useSignaling)
    handleSignalingMessage,

    // Actions
    createOffer,
    handleOffer,
    handleAnswer,
    addIceCandidate,
    replaceTrack,
    setVideoBitrate,
    setPreferredCodec,
    restartIce,
    close,
    setEffectiveRemoteNodeId,
  };
}
