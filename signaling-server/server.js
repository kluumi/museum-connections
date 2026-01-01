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

// Rate limiting
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX_MESSAGES = 50; // messages per window

// Message types that should be broadcast to all clients
const BROADCAST_EVENTS = new Set([
  "stream_stopped",
  "stream_started",
  "page_opened",
  "stream_restored",
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
 * Broadcasts a message to all clients except the sender
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @param {string} [excludeClient]
 */
function broadcast(type, payload, excludeClient) {
  const message = JSON.stringify({ type, ...payload });
  let sentCount = 0;

  for (const [id, ws] of clients) {
    if (id !== excludeClient && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
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
    targetWs.send(JSON.stringify(data));
    log("DEBUG", `Relay ${data.type}`, { from: senderId, to: targetId });
  } else {
    log("WARN", "Target not found", { target: targetId, from: senderId });
    senderWs.send(
      JSON.stringify({
        type: "error",
        error: "target_not_found",
        target: targetId,
      })
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

// --- HTTP Server for Health Check ---
const httpServer = createServer((req, res) => {
  if ((req.url === "/health" || req.url === "/") && req.method === "GET") {
    const uptimeSeconds = (Date.now() - metrics.startTime) / 1000;
    const messageStats = Object.fromEntries(metrics.messagesPerType);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "healthy",
        clients: {
          current: clients.size,
          total: metrics.totalConnections,
          list: [...clients.keys()],
        },
        messages: {
          total: metrics.totalMessages,
          byType: messageStats,
        },
        uptime: Math.round(uptimeSeconds),
        timestamp: new Date().toISOString(),
      })
    );
  } else if (req.url === "/clients" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ clients: [...clients.keys()] }));
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

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
        ws.send(JSON.stringify({ type: "error", error: "invalid_name" }));
        ws.close(4001, "Invalid client name");
        log("WARN", "Invalid login name", { provided: data.name ?? data.id });
        return;
      }

      // Handle reconnection: close old connection if same name
      const existingWs = clients.get(name);
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
      ws.send(
        JSON.stringify({
          type: "login_success",
          id: clientId,
          clients: [...clients.keys()],
        })
      );

      // Notify other clients
      broadcast("peer_connected", { peer: clientId }, clientId);
      return;
    }

    // All other messages require login
    if (!clientId) {
      log("WARN", "Message before login", { type: data.type });
      ws.send(JSON.stringify({ type: "error", error: "not_logged_in" }));
      return;
    }

    // Rate limiting
    if (!checkRateLimit(clientId)) {
      log("WARN", "Rate limit exceeded", { clientId });
      ws.send(JSON.stringify({ type: "error", error: "rate_limit_exceeded" }));
      return;
    }

    // --- Heartbeat/Ping ---
    if (data.type === "ping") {
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
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

    // --- Relay to target ---
    if (data.target && RELAY_EVENTS.has(data.type)) {
      relayToTarget(data.target, data, ws, clientId);
      return;
    }

    // --- Unknown message with target (relay anyway for flexibility) ---
    if (data.target) {
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
  });

  // Periodic ping to keep connection alive
  pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, PING_INTERVAL);
});

// Clean up stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, limit] of rateLimits) {
    if (now > limit.resetTime + RATE_LIMIT_WINDOW) {
      rateLimits.delete(id);
    }
  }
}, 60_000);

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
