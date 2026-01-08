// ============================================================================
// SIGNALING SERVER - WebRTC Signaling with Health Check
// ============================================================================
// WebSocket server for WebRTC signaling between clients
// Deployment: Railway (or any Node.js service)
// ============================================================================

import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";

// --- Configuration ---
const PORT = process.env.PORT || 8080;
const PING_INTERVAL = 30_000;
const MAX_CLIENT_NAME_LENGTH = 64;
const MAX_PAYLOAD = 64 * 1024; // 64KB
const HTTP_TIMEOUT = 30_000; // 30 seconds - prevents Slowloris attacks

// Rate limiting
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX_MESSAGES = 50; // messages per window

// Message types that should be broadcast to all clients
const BROADCAST_EVENTS = new Set([
  "stream_starting",   // Sender clicked start, loading started
  "stream_stopping",   // Sender clicked stop, loading started
  "stream_started",    // WebRTC connected, stream is live
  "stream_stopped",    // WebRTC disconnected, stream ended
  "stream_heartbeat",  // Sender alive signal (every 5s while streaming)
  "stream_error",      // Sender encountered error during start/stream
  "page_opened",       // Page loaded/refreshed
  "stream_restored",   // Network recovered after loss
]);

// Message types that should be relayed to a specific target
const RELAY_EVENTS = new Set([
  "offer",
  "answer",
  "candidate",
  "ice-candidate",
  "request_offer",
]);

// --- State ---
/** @type {Map<string, WebSocket>} */
const clients = new Map();

/** @type {Map<string, { count: number, resetTime: number }>} */
const rateLimits = new Map();

// Metrics
const metrics = {
  totalConnections: 0,
  totalMessages: 0,
  messagesPerType: new Map(),
  startTime: Date.now(),
};

// --- Logging ---
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LOG_LEVEL =
  LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function log(level, message, data = {}) {
  if (LOG_LEVELS[level] < LOG_LEVEL) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...data,
  };

  if (level === "ERROR") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// --- Validation ---
/**
 * Validates and sanitizes a client name
 * @param {unknown} name
 * @returns {string | null}
 */
function validateClientName(name) {
  if (typeof name !== "string") return null;
  const sanitized = name.trim().slice(0, MAX_CLIENT_NAME_LENGTH);
  // Only allow alphanumeric, dash, underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) return null;
  return sanitized.length > 0 ? sanitized : null;
}

/**
 * Validates a relay message has required fields
 * @param {object} data - The message data
 * @param {string} type - Expected message type
 * @returns {{ valid: boolean, error?: string }}
 */
function validateRelayMessage(data, type) {
  // Validate target
  if (!data.target || typeof data.target !== "string") {
    return { valid: false, error: "missing_target" };
  }
  if (!validateClientName(data.target)) {
    return { valid: false, error: "invalid_target" };
  }

  // Type-specific validation
  switch (type) {
    case "offer":
    case "answer":
      if (!data.offer && !data.answer) {
        return { valid: false, error: "missing_sdp" };
      }
      // Validate SDP is an object with type and sdp fields
      const sdp = data.offer || data.answer;
      if (typeof sdp !== "object" || !sdp.type || !sdp.sdp) {
        return { valid: false, error: "invalid_sdp" };
      }
      break;
    case "candidate":
    case "ice-candidate":
      if (!data.candidate) {
        return { valid: false, error: "missing_candidate" };
      }
      break;
    // request_offer doesn't need additional validation
  }

  return { valid: true };
}

/**
 * Check rate limit for a client
 * @param {string} clientId
 * @returns {boolean} true if within limits
 */
function checkRateLimit(clientId) {
  const now = Date.now();
  const limit = rateLimits.get(clientId);

  if (!limit || now > limit.resetTime) {
    rateLimits.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX_MESSAGES) {
    return false;
  }

  limit.count++;
  return true;
}

// --- Message Handling ---
/**
 * Safely send a message to a WebSocket, catching errors
 * @param {WebSocket} ws
 * @param {string} message
 * @param {string} [clientId] - for logging
 * @returns {boolean} true if sent successfully
 */
function safeSend(ws, message, clientId = "unknown") {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      return true;
    }
    return false;
  } catch (error) {
    log("ERROR", "Failed to send message", {
      clientId,
      error: error.message,
    });
    return false;
  }
}

/**
 * Broadcasts a message to all clients except the sender
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @param {string} [excludeClient]
 */
function broadcast(type, payload, excludeClient) {
  const message = JSON.stringify({ type, ...payload });
  let sentCount = 0;

  for (const [id, ws] of clients) {
    if (id !== excludeClient && safeSend(ws, message, id)) {
      sentCount++;
    }
  }

  log("DEBUG", `Broadcast ${type}`, { from: excludeClient, sentTo: sentCount });
}

/**
 * Send message to a specific target
 * @param {string} targetId
 * @param {object} data
 * @param {WebSocket} senderWs
 * @param {string} senderId
 */
function relayToTarget(targetId, data, senderWs, senderId) {
  const targetWs = clients.get(targetId);

  if (targetWs?.readyState === WebSocket.OPEN) {
    data.from = senderId;
    if (safeSend(targetWs, JSON.stringify(data), targetId)) {
      log("DEBUG", `Relay ${data.type}`, { from: senderId, to: targetId });
    }
  } else {
    log("WARN", "Target not found", { target: targetId, from: senderId });
    safeSend(
      senderWs,
      JSON.stringify({
        type: "error",
        error: "target_not_found",
        target: targetId,
      }),
      senderId
    );
  }
}

/**
 * Track message metrics
 * @param {string} type
 */
function trackMessage(type) {
  metrics.totalMessages++;
  const count = metrics.messagesPerType.get(type) || 0;
  metrics.messagesPerType.set(type, count + 1);
}

// Check if request is from localhost (for sensitive endpoints)
function isLocalRequest(req) {
  const remoteAddress = req.socket.remoteAddress;
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

// --- HTTP Server for Health Check ---
const httpServer = createServer((req, res) => {
  try {
    if ((req.url === "/health" || req.url === "/") && req.method === "GET") {
      const uptimeSeconds = (Date.now() - metrics.startTime) / 1000;
      const messageStats = Object.fromEntries(metrics.messagesPerType);

      // Basic health info for public access
      const healthResponse = {
        status: "healthy",
        clients: {
          current: clients.size,
          total: metrics.totalConnections,
        },
        messages: {
          total: metrics.totalMessages,
          byType: messageStats,
        },
        uptime: Math.round(uptimeSeconds),
        timestamp: new Date().toISOString(),
      };

      // Only expose client list to localhost requests
      if (isLocalRequest(req)) {
        healthResponse.clients.list = [...clients.keys()];
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(healthResponse));
    } else if (req.url === "/clients" && req.method === "GET") {
      // /clients endpoint only accessible from localhost
      if (!isLocalRequest(req)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ clients: [...clients.keys()] }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  } catch (error) {
    log("ERROR", "HTTP handler error", { error: error.message, url: req.url });
    try {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
      }
      res.end(JSON.stringify({ error: "Internal server error" }));
    } catch {
      // Response already ended or connection closed
    }
  }
});

// Handle HTTP server errors
httpServer.on("error", (error) => {
  log("ERROR", "HTTP server error", { error: error.message });
});

// Set HTTP timeouts to prevent Slowloris attacks
httpServer.timeout = HTTP_TIMEOUT;
httpServer.headersTimeout = HTTP_TIMEOUT;
httpServer.requestTimeout = HTTP_TIMEOUT;

// --- WebSocket Server ---
const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: MAX_PAYLOAD,
});

wss.on("connection", (ws, req) => {
  let clientId = null;
  let pingInterval = null;
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  log("INFO", "New connection", { ip: clientIp });
  metrics.totalConnections++;

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      log("WARN", "Invalid JSON", { clientId });
      return;
    }

    // Validate message has type
    if (!data.type || typeof data.type !== "string") {
      log("WARN", "Missing message type", { clientId });
      return;
    }

    trackMessage(data.type);

    // --- Login (must be first message) ---
    if (data.type === "login") {
      const name = validateClientName(data.name ?? data.id);
      if (!name) {
        safeSend(ws, JSON.stringify({ type: "error", error: "invalid_name" }));
        ws.close(4001, "Invalid client name");
        log("WARN", "Invalid login name", { provided: data.name ?? data.id });
        return;
      }

      // Block duplicate connections for critical nodes (senders + OBS receivers)
      // These are critical - we don't want to kick an active stream or OBS display
      const PROTECTED_NODES = ["nantes", "paris", "obs_nantes", "obs_paris"];
      const existingWs = clients.get(name);
      if (existingWs && PROTECTED_NODES.includes(name)) {
        const isSender = ["nantes", "paris"].includes(name);
        const nodeType = isSender ? "émetteur" : "récepteur OBS";
        const displayName = name.replace("obs_", "OBS ");
        log("WARN", `Duplicate ${isSender ? "sender" : "OBS receiver"} connection rejected`, {
          clientId: name,
        });
        safeSend(
          ws,
          JSON.stringify({
            type: "login_error",
            error: "already_connected",
            message: `Un ${nodeType} ${displayName} est déjà connecté`,
          })
        );
        ws.close(4003, `${isSender ? "Sender" : "OBS receiver"} already connected`);
        return;
      }

      // For other nodes (operators, receivers), allow reconnection by closing old connection
      if (existingWs) {
        log("INFO", "Reconnection detected, closing old connection", {
          clientId: name,
        });
        existingWs.close(4002, "Replaced by new connection");
        clients.delete(name);
      }

      clientId = name;
      clients.set(clientId, ws);
      log("INFO", "Client registered", {
        clientId,
        totalClients: clients.size,
      });

      // Confirm registration
      safeSend(
        ws,
        JSON.stringify({
          type: "login_success",
          id: clientId,
          clients: [...clients.keys()],
        }),
        clientId
      );

      // Notify other clients
      broadcast("peer_connected", { peer: clientId }, clientId);
      return;
    }

    // All other messages require login
    if (!clientId) {
      log("WARN", "Message before login", { type: data.type });
      safeSend(ws, JSON.stringify({ type: "error", error: "not_logged_in" }));
      return;
    }

    // Rate limiting
    if (!checkRateLimit(clientId)) {
      log("WARN", "Rate limit exceeded", { clientId });
      safeSend(ws, JSON.stringify({ type: "error", error: "rate_limit_exceeded" }), clientId);
      return;
    }

    // --- Heartbeat/Ping ---
    if (data.type === "ping") {
      safeSend(ws, JSON.stringify({ type: "pong", timestamp: Date.now() }), clientId);
      return;
    }

    // --- Broadcast events ---
    if (BROADCAST_EVENTS.has(data.type)) {
      const payload = { from: clientId };
      if (data.type === "stream_stopped") {
        payload.reason = data.reason || "manual";
      }
      log("INFO", `Broadcast: ${data.type}`, {
        from: clientId,
        reason: payload.reason,
      });
      broadcast(data.type, payload, clientId);
      return;
    }

    // --- Audio ducking: relay to target AND broadcast to observers ---
    // This allows the operator dashboard to see VOX state for both senders
    if (data.type === "audio_ducking" && data.target) {
      if (!validateClientName(data.target)) {
        safeSend(ws, JSON.stringify({ type: "error", error: "invalid_target" }), clientId);
        return;
      }
      // Relay to target (the sender being ducked)
      relayToTarget(data.target, data, ws, clientId);
      // Also broadcast to all observers (operator dashboards)
      const message = JSON.stringify({ ...data, from: clientId });
      for (const [id, clientWs] of clients) {
        // Skip sender and target - they already know
        if (id !== clientId && id !== data.target) {
          safeSend(clientWs, message, id);
        }
      }
      // Count how many observers received the message
      let observerCount = 0;
      for (const id of clients.keys()) {
        if (id !== clientId && id !== data.target) observerCount++;
      }
      log("INFO", `Audio ducking: ${data.ducking ? "DUCK" : "UNDUCK"}`, {
        from: clientId,
        to: data.target,
        observers: observerCount,
      });
      return;
    }

    // --- Relay to target ---
    if (data.target && RELAY_EVENTS.has(data.type)) {
      // Validate relay message structure
      const validation = validateRelayMessage(data, data.type);
      if (!validation.valid) {
        log("WARN", "Invalid relay message", {
          type: data.type,
          error: validation.error,
          clientId,
        });
        safeSend(
          ws,
          JSON.stringify({ type: "error", error: validation.error }),
          clientId
        );
        return;
      }
      relayToTarget(data.target, data, ws, clientId);
      return;
    }

    // --- Unknown message with target (relay anyway for flexibility) ---
    if (data.target) {
      // Still validate target is a valid node ID
      if (!validateClientName(data.target)) {
        log("WARN", "Invalid target in unknown message", {
          type: data.type,
          clientId,
        });
        safeSend(
          ws,
          JSON.stringify({ type: "error", error: "invalid_target" }),
          clientId
        );
        return;
      }
      log("DEBUG", "Relaying unknown message type", {
        type: data.type,
        from: clientId,
        to: data.target,
      });
      relayToTarget(data.target, data, ws, clientId);
      return;
    }

    log("DEBUG", "Unhandled message type", { type: data.type, clientId });
  });

  ws.on("close", (code, reason) => {
    if (pingInterval) clearInterval(pingInterval);

    if (clientId) {
      clients.delete(clientId);
      rateLimits.delete(clientId);
      log("INFO", "Client disconnected", {
        clientId,
        code,
        reason: reason?.toString(),
        remainingClients: clients.size,
      });
      broadcast("peer_disconnected", { peer: clientId });
    }
  });

  ws.on("error", (error) => {
    log("ERROR", "WebSocket error", { clientId, error: error.message });
    // Clear ping interval on error to prevent zombie intervals
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  });

  // Periodic ping to keep connection alive
  pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, PING_INTERVAL);
});

// Clean up stale rate limit entries periodically (every 10s to minimize memory)
setInterval(() => {
  const now = Date.now();
  for (const [id, limit] of rateLimits) {
    if (now > limit.resetTime + RATE_LIMIT_WINDOW) {
      rateLimits.delete(id);
    }
  }
}, 10_000);

// --- Server Startup ---
httpServer.listen(PORT, () => {
  log("INFO", "Server started", { port: PORT });
  console.log("============================================");
  console.log("Signaling server started");
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Clients list: http://localhost:${PORT}/clients`);
  console.log("============================================");
});

// Graceful shutdown
function shutdown(signal) {
  log("INFO", "Shutdown initiated", { signal });
  console.log(`${signal} received, shutting down...`);

  for (const ws of wss.clients) {
    ws.close(1001, "Server shutting down");
  }

  httpServer.close(() => {
    log("INFO", "Server stopped");
    console.log("Server stopped");
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    log("WARN", "Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
