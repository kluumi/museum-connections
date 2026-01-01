# WebRTC Signaling Server

WebRTC signaling server for peer-to-peer video streaming connections.

**Location:** `webrtc-test/server-signaling/`

**Parent Project:** See `../CLAUDE.md` for full project context.

## Architecture

Single-file Node.js server (`server.js`) providing:
- **WebSocket server**: Client registration, message relay, broadcast events
- **HTTP endpoints**: Health check, client list for monitoring
- **Rate limiting**: Protection against message flooding
- **Structured logging**: JSON logs with configurable levels
- **Reconnection handling**: Graceful replacement of stale connections

## Tech Stack

- Node.js 24+ (ES Modules)
- `ws` library (WebSocket only dependency)

## Running

```bash
npm install
npm start                    # Port 8080 by default
PORT=3000 npm start          # Custom port
LOG_LEVEL=DEBUG npm start    # Verbose logging
```

## Deployment

Currently deployed on **Railway** at:
```
wss://td-signaling-server-production.up.railway.app
```

## Endpoints

| Endpoint | Protocol | Purpose |
|----------|----------|---------|
| `/` | WebSocket | Signaling |
| `/health` | HTTP GET | Health check with metrics (clients, messages, uptime) |
| `/clients` | HTTP GET | List of connected client IDs |

## WebSocket Protocol

All messages are JSON with a `type` field.

### Client → Server

| Type | Fields | Description |
|------|--------|-------------|
| `login` | `name` or `id` | Register client (required first message) |
| `ping` | - | Heartbeat request |
| `stream_started` | - | Notify peers streaming began |
| `stream_stopped` | `reason?` | Notify peers streaming ended |
| `stream_restored` | - | Notify peers connection recovered |
| `page_opened` | - | Notify peers browser page opened |
| `offer` | `target`, `sdp` | WebRTC SDP offer |
| `answer` | `target`, `sdp` | WebRTC SDP answer |
| `candidate` | `target`, `candidate` | ICE candidate |
| `request_offer` | `target` | Request stream from sender |

### Server → Client

| Type | Fields | Description |
|------|--------|-------------|
| `login_success` | `id`, `clients[]` | Registration confirmed |
| `error` | `error`, `target?` | Error occurred |
| `peer_connected` | `peer` | New peer joined |
| `peer_disconnected` | `peer` | Peer left |
| `pong` | `timestamp` | Heartbeat response |
| Broadcast events | `from`, `reason?` | Relayed from other peers |

### Error Codes

| WebSocket Code | Error | Reason |
|----------------|-------|--------|
| 4001 | `invalid_name` | Empty or invalid name (alphanumeric, dash, underscore only) |
| 4002 | - | Replaced by new connection (reconnection) |
| - | `target_not_found` | Target peer not connected |
| - | `not_logged_in` | Message sent before login |
| - | `rate_limit_exceeded` | Too many messages (50/second) |

## Configuration

Environment variables:
- `PORT`: Server port (default: 8080)
- `LOG_LEVEL`: DEBUG, INFO, WARN, ERROR (default: INFO)

Constants in code:
- `PING_INTERVAL`: 30 seconds
- `MAX_CLIENT_NAME_LENGTH`: 64 characters
- `MAX_PAYLOAD`: 64KB
- `RATE_LIMIT_MAX_MESSAGES`: 50 messages per second

## Features

### Rate Limiting
- 50 messages per second per client
- Prevents flooding attacks
- Returns `rate_limit_exceeded` error when exceeded

### Reconnection Handling
- Same client name can reconnect
- Old connection is closed with code 4002
- No `name_taken` error for reconnections

### Structured Logging
- JSON format for easy parsing
- Configurable log levels via `LOG_LEVEL` env var
- Includes timestamps, client IDs, message types

### Health Endpoint
Returns detailed metrics:
```json
{
  "status": "healthy",
  "clients": { "current": 3, "total": 10, "list": ["nantes", "paris", "operator"] },
  "messages": { "total": 1234, "byType": { "offer": 50, "answer": 50 } },
  "uptime": 3600,
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

## Deployment

Designed for Railway but works on any Node.js host. Handles:
- `SIGTERM`/`SIGINT` for graceful shutdown (10s timeout)
- Keep-alive pings to prevent proxy timeouts
- Automatic rate limit cleanup (every 60 seconds)
