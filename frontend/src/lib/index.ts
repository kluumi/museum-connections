// Barrel export for lib utilities
// Provides a single entry point for all utility modules

// Error handling utilities
export {
  // Error classes
  AppError,
  assertDefined,
  categorizeError,
  createErrorHandler,
  // Types
  type ErrorCategory,
  err,
  // Functions
  getErrorMessage,
  handleError,
  handleWarning,
  isAppError,
  isErrorCategory,
  type LogLevel,
  logServiceError,
  MediaError,
  NetworkError,
  // Result constructors
  ok,
  type Result,
  SignalingError,
  tryAsync,
  WebRTCError,
  withErrorHandling,
} from "./errors";

// Event bus for cross-component communication
export { type EventMap, eventBus } from "./events";

// Heartbeat monitoring for connection health
export { HeartbeatMonitor, type HeartbeatStatus } from "./heartbeat-monitor";

// Logger with categorized output
export {
  logger,
  mediaLogger,
  signalingLogger,
  statsLogger,
  webrtcLogger,
} from "./logger";

// Offer request management
export {
  OfferRequester,
  type OfferRequesterConfig,
  type OfferRequestStateChangeCallback,
  type RequestOfferCallback,
  type SourceOfferState,
} from "./offer-requester";

// WebRTC stats parsing
export { type PreviousStats, parseStats } from "./stats-parser";

// General utilities
export { applyJitter, cn, debounce } from "./utils";
