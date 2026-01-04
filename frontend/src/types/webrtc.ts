// WebRTC-related types

import type { NodeId } from "@/constants";

// Video settings matching legacy dashboard.js
export interface VideoSettings {
  mode: "manual" | "auto";
  resolution: VideoResolution;
  fps: VideoFps;
  bitrate: VideoBitrate;
  codec: VideoCodec;
}

// VideoResolution is now a string to support dynamic resolutions from camera capabilities
export type VideoResolution = "auto" | string;
export type VideoFps = "auto" | number;
export type VideoBitrate = "auto" | 8000 | 5000 | 3000 | 2000 | 1000 | 500;
export type VideoCodec = "auto" | "VP8" | "VP9" | "H264";

// Resolution constraints - maps resolution labels to actual dimensions
// This is used for standard resolutions; dynamic resolutions use the format "WIDTHxHEIGHT"
export const RESOLUTION_CONSTRAINTS: Record<
  string,
  { width: number; height: number }
> = {
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
  "480p (16:9)": { width: 854, height: 480 },
  "480p (4:3)": { width: 640, height: 480 },
  "480p": { width: 854, height: 480 }, // Legacy support
  "VGA (4:3)": { width: 640, height: 480 },
  "360p": { width: 640, height: 360 },
  QVGA: { width: 320, height: 240 },
};

// Default video settings (auto mode enabled by default for optimal quality)
export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  mode: "auto",
  resolution: "auto",
  fps: "auto",
  bitrate: "auto",
  codec: "auto",
};

// Media device info
export interface MediaDeviceState {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  selectedSpeakerId: string | null;
}

// Peer connection state
export interface PeerConnectionState {
  peerId: NodeId;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
}

// Stream info
export interface StreamInfo {
  id: string;
  active: boolean;
  videoTracks: MediaStreamTrack[];
  audioTracks: MediaStreamTrack[];
}

// ICE candidate info for debugging
export interface IceCandidateInfo {
  type: RTCIceCandidateType | null;
  protocol: string | null;
  address: string | null;
  port: number | null;
}

// Connection quality info
export interface ConnectionQuality {
  score: number; // 0-100
  label: "excellent" | "good" | "fair" | "poor";
  color: string;
}

// Resilient connection options
export interface ResilientConnectionOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  multiplier?: number;
  onReconnecting?: (attempt: number, delay: number) => void;
  onReconnected?: () => void;
  onFailed?: (error: Error) => void;
}

// WebRTC configuration
export interface WebRTCConfig {
  iceServers: RTCIceServer[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
}
