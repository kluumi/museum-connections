// Signaling protocol types matching server-signaling/server.js

import type { NodeId, StopReason } from "@/constants";

// Base message structure
interface BaseMessage {
  type: string;
  from?: NodeId;
  to?: NodeId;
}

// Client -> Server messages
export interface LoginMessage extends BaseMessage {
  type: "login";
  id: NodeId;
}

export interface OfferMessage extends BaseMessage {
  type: "offer";
  target: NodeId;
  offer: RTCSessionDescriptionInit;
}

export interface AnswerMessage extends BaseMessage {
  type: "answer";
  target: NodeId;
  answer: RTCSessionDescriptionInit;
}

export interface CandidateMessage extends BaseMessage {
  type: "candidate";
  target: NodeId;
  candidate: RTCIceCandidateInit;
}

export interface PingMessage extends BaseMessage {
  type: "ping";
}

export interface RequestOfferMessage extends BaseMessage {
  type: "request_offer";
  target: NodeId;
}

export interface StreamStartingMessage extends BaseMessage {
  type: "stream_starting";
}

export interface StreamStoppingMessage extends BaseMessage {
  type: "stream_stopping";
}

export interface StreamStartedMessage extends BaseMessage {
  type: "stream_started";
}

export interface StreamStoppedMessage extends BaseMessage {
  type: "stream_stopped";
  reason?: StopReason;
}

export interface StreamRestoredMessage extends BaseMessage {
  type: "stream_restored";
}

export interface PageOpenedMessage extends BaseMessage {
  type: "page_opened";
}

// Stream heartbeat (sender -> all, while streaming)
export interface StreamHeartbeatMessage extends BaseMessage {
  type: "stream_heartbeat";
}

// Stream error types for categorizing failures
export type StreamErrorType =
  | "media_permission_denied" // Camera/mic access denied
  | "webrtc_offer_failed" // Failed to create/send offer
  | "webrtc_connection_failed" // ICE/connection failed
  | "timeout"; // Operation timed out

// Stream error notification (sender -> all, on failure)
export interface StreamErrorMessage extends BaseMessage {
  type: "stream_error";
  error: StreamErrorType;
  message: string; // Human-readable error message
}

// Remote stream control (operator -> sender)
export interface StreamControlMessage extends BaseMessage {
  type: "stream_control";
  target: NodeId;
  action: "start" | "stop";
}

// VOX Ducking control (sender -> sender)
// Sent when one sender detects speech and wants the other to duck their audio
export interface AudioDuckingMessage extends BaseMessage {
  type: "audio_ducking";
  target: NodeId;
  /** Whether ducking should be active */
  ducking: boolean;
  /** Gain level to apply when ducked (0-1) */
  gain: number;
}

// Server -> Client messages
export interface LoginSuccessMessage extends BaseMessage {
  type: "login_success";
  clients: NodeId[];
}

export interface PongMessage extends BaseMessage {
  type: "pong";
}

export interface PeerConnectedMessage extends BaseMessage {
  type: "peer_connected";
  peer: NodeId;
}

export interface PeerDisconnectedMessage extends BaseMessage {
  type: "peer_disconnected";
  peer: NodeId;
}

export interface ErrorMessage extends BaseMessage {
  type: "error";
  message: string;
}

export interface LoginErrorMessage extends BaseMessage {
  type: "login_error";
  error: "already_connected" | string;
  message: string;
}

// Server restart notification (server -> all clients during graceful shutdown)
export interface ServerRestartMessage extends BaseMessage {
  type: "server_restart";
  message: string;
  /** Suggested delay before reconnecting (ms) */
  reconnectIn: number;
}

// Union types for all messages
export type ClientToServerMessage =
  | LoginMessage
  | OfferMessage
  | AnswerMessage
  | CandidateMessage
  | PingMessage
  | RequestOfferMessage
  | StreamStartingMessage
  | StreamStoppingMessage
  | StreamStartedMessage
  | StreamStoppedMessage
  | StreamRestoredMessage
  | PageOpenedMessage
  | StreamHeartbeatMessage
  | StreamErrorMessage
  | StreamControlMessage
  | AudioDuckingMessage;

export type ServerToClientMessage =
  | LoginSuccessMessage
  | LoginErrorMessage
  | PongMessage
  | PeerConnectedMessage
  | PeerDisconnectedMessage
  | OfferMessage
  | AnswerMessage
  | CandidateMessage
  | RequestOfferMessage
  | StreamStartingMessage
  | StreamStoppingMessage
  | StreamStartedMessage
  | StreamStoppedMessage
  | StreamRestoredMessage
  | PageOpenedMessage
  | StreamHeartbeatMessage
  | StreamErrorMessage
  | StreamControlMessage
  | AudioDuckingMessage
  | ErrorMessage
  | ServerRestartMessage;

export type SignalingMessage = ClientToServerMessage | ServerToClientMessage;

// Type guard helpers
export function isOfferMessage(msg: SignalingMessage): msg is OfferMessage {
  return msg.type === "offer";
}

export function isAnswerMessage(msg: SignalingMessage): msg is AnswerMessage {
  return msg.type === "answer";
}

export function isCandidateMessage(
  msg: SignalingMessage,
): msg is CandidateMessage {
  return msg.type === "candidate";
}

export function isLoginSuccessMessage(
  msg: SignalingMessage,
): msg is LoginSuccessMessage {
  return msg.type === "login_success";
}

export function isPeerConnectedMessage(
  msg: SignalingMessage,
): msg is PeerConnectedMessage {
  return msg.type === "peer_connected";
}

export function isPeerDisconnectedMessage(
  msg: SignalingMessage,
): msg is PeerDisconnectedMessage {
  return msg.type === "peer_disconnected";
}

export function isRequestOfferMessage(
  msg: SignalingMessage,
): msg is RequestOfferMessage {
  return msg.type === "request_offer";
}

export function isStreamStartingMessage(
  msg: SignalingMessage,
): msg is StreamStartingMessage {
  return msg.type === "stream_starting";
}

export function isStreamStoppingMessage(
  msg: SignalingMessage,
): msg is StreamStoppingMessage {
  return msg.type === "stream_stopping";
}

export function isStreamStartedMessage(
  msg: SignalingMessage,
): msg is StreamStartedMessage {
  return msg.type === "stream_started";
}

export function isStreamStoppedMessage(
  msg: SignalingMessage,
): msg is StreamStoppedMessage {
  return msg.type === "stream_stopped";
}

export function isStreamControlMessage(
  msg: SignalingMessage,
): msg is StreamControlMessage {
  return msg.type === "stream_control";
}

export function isStreamErrorMessage(
  msg: SignalingMessage,
): msg is StreamErrorMessage {
  return msg.type === "stream_error";
}

export function isStreamHeartbeatMessage(
  msg: SignalingMessage,
): msg is StreamHeartbeatMessage {
  return msg.type === "stream_heartbeat";
}

export function isStreamRestoredMessage(
  msg: SignalingMessage,
): msg is StreamRestoredMessage {
  return msg.type === "stream_restored";
}

export function isPageOpenedMessage(
  msg: SignalingMessage,
): msg is PageOpenedMessage {
  return msg.type === "page_opened";
}

export function isLoginErrorMessage(
  msg: SignalingMessage,
): msg is LoginErrorMessage {
  return msg.type === "login_error";
}

export function isAudioDuckingMessage(
  msg: SignalingMessage,
): msg is AudioDuckingMessage {
  return msg.type === "audio_ducking";
}
