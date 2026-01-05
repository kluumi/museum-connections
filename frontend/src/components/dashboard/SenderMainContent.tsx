// SenderMainContent - Video preview, status bar, and control bar container
// Pattern: Extracted from SenderDashboard for better modularity

import type { RefObject } from "react";
import type { ConnectionState } from "@/constants/connection-states";
import type { NodeId, SenderNodeId } from "@/constants/node-ids";
import { SenderStatusBar } from "./SenderStatusBar";
import { SenderVideoPreview } from "./SenderVideoPreview";
import { StreamControlBar } from "./StreamControlBar";

interface SenderMainContentProps {
  // Node identity
  nodeId: SenderNodeId;
  accentColor: "nantes" | "paris";
  targetCity: string;

  // Video refs
  videoRef: RefObject<HTMLVideoElement | null>;
  videoContainerRef: RefObject<HTMLDivElement | null>;

  // Stream state
  localStream: MediaStream | null;
  isStreaming: boolean;
  streamLoading: boolean;
  streamLoadingType: "starting" | "stopping" | null;
  streamStartTime: number | null;

  // Video state
  isVideoReady: boolean;
  setIsVideoReady: (ready: boolean) => void;
  isInitializing: boolean;
  isLoadingCamera: boolean;
  selectedCameraId: string | null;

  // Connection state
  isSignalingConnected: boolean;
  connectedPeers: NodeId[];
  webrtcConnectionState: ConnectionState;
  isObsConnected: boolean;

  // Audio
  isAudioEnabled: boolean;

  // Fullscreen
  isFullscreen: boolean;
  onFullscreenToggle: () => void;

  // Handlers
  onStartStream: () => void;
  onStopStream: () => void;
  onToggleAudio: () => void;
  onOpenSettings: () => void;
}

const buttonStyles = {
  nantes:
    "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
  paris:
    "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
};

export function SenderMainContent({
  nodeId,
  accentColor,
  targetCity,
  videoRef,
  videoContainerRef,
  localStream,
  isStreaming,
  streamLoading,
  streamLoadingType,
  streamStartTime,
  isVideoReady,
  setIsVideoReady,
  isInitializing,
  isLoadingCamera,
  selectedCameraId,
  isSignalingConnected,
  connectedPeers,
  webrtcConnectionState,
  isObsConnected,
  isAudioEnabled,
  isFullscreen,
  onFullscreenToggle,
  onStartStream,
  onStopStream,
  onToggleAudio,
  onOpenSettings,
}: SenderMainContentProps) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Left: Video Preview with Controls */}
      <div className="space-y-2">
        {/* Connection Status Badges - Centered above video */}
        <SenderStatusBar
          nodeId={nodeId}
          isSignalingConnected={isSignalingConnected}
          connectedPeers={connectedPeers}
          webrtcConnectionState={webrtcConnectionState}
          targetCity={targetCity}
        />

        {/* Video + Controls Container (merged) */}
        <div className="overflow-hidden rounded-lg border bg-card">
          {/* Video Container */}
          <SenderVideoPreview
            videoRef={videoRef}
            videoContainerRef={videoContainerRef}
            localStream={localStream}
            webrtcConnectionState={webrtcConnectionState}
            isVideoReady={isVideoReady}
            setIsVideoReady={setIsVideoReady}
            isInitializing={isInitializing}
            isLoadingCamera={isLoadingCamera}
            selectedCameraId={selectedCameraId}
            isFullscreen={isFullscreen}
            onFullscreenToggle={onFullscreenToggle}
            onOpenSettings={onOpenSettings}
          />

          {/* Control Bar - Merged with video */}
          <StreamControlBar
            isStreaming={isStreaming}
            streamLoading={streamLoading}
            streamLoadingType={streamLoadingType}
            streamStartTime={streamStartTime}
            webrtcConnectionState={webrtcConnectionState}
            localStream={localStream}
            selectedCameraId={selectedCameraId}
            isAudioEnabled={isAudioEnabled}
            isObsConnected={isObsConnected}
            isSignalingConnected={isSignalingConnected}
            isFullscreen={isFullscreen}
            accentColor={accentColor}
            targetCity={targetCity}
            buttonStyles={buttonStyles[accentColor]}
            onStartStream={onStartStream}
            onStopStream={onStopStream}
            onToggleAudio={onToggleAudio}
            onToggleFullscreen={onFullscreenToggle}
          />
        </div>
      </div>
    </div>
  );
}
