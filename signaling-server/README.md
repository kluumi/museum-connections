# WebRTC Signaling Server

A lightweight WebRTC signaling server for peer-to-peer connections.

## What is a Signaling Server?

WebRTC enables direct peer-to-peer communication between browsers/applications, but peers need a way to find each other and exchange connection details first. This is called "signaling."

```
┌──────────────┐                                    ┌──────────────┐
│   Client A   │                                    │   Client B   │
└──────┬───────┘                                    └──────┬───────┘
       │                                                   │
       │  1. Connect + Login                               │
       ├──────────────────────►┌─────────────────┐         │
       │                       │                 │◄────────┤ 2. Connect + Login
       │  3. Get peer list     │   Signaling     │         │
       │◄──────────────────────┤     Server      ├────────►│ 4. Get peer list
       │                       │                 │         │
       │  5. Send SDP Offer ──►│                 │────────►│ 6. Receive Offer
       │                       │                 │         │
       │  8. Receive Answer◄───│                 │◄────────│ 7. Send SDP Answer
       │                       │                 │         │
       │  9. Exchange ICE ◄───►│                 │◄───────►│ 10. Exchange ICE
       │                       └─────────────────┘         │
       │                                                   │
       │◄═══════════════ Direct P2P Connection ══════════►│
       │              (Video/Audio/Data)                   │
```

This server handles steps 1-10. Once peers exchange their connection details (SDP offers/answers and ICE candidates), they connect directly without the signaling server.

## Features

- **Peer discovery**: Clients register with names and see who else is connected
- **Message relay**: Routes WebRTC signaling messages between specific peers
- **Broadcast events**: Notifies all peers about stream state changes
- **Health endpoint**: HTTP `/health` for container orchestration (Railway, Docker, K8s)
- **Keep-alive**: Automatic ping/pong prevents proxy timeouts
- **Graceful shutdown**: Clean disconnect on SIGTERM/SIGINT

## Requirements

- Node.js 24 or higher

## Installation

```bash
git clone <repository-url>
cd td-signaling-server
npm install
```

## Usage

### Start the server

```bash
npm start
```

### Custom port

```bash
PORT=3000 npm start
```

### Health check

```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "healthy",
  "clientCount": 2,
  "uptime": 3600.123,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## WebSocket Protocol

Connect via WebSocket to `ws://localhost:8080` (or your deployed URL).

All messages are JSON objects with a `type` field.

### 1. Login (required first message)

```json
{ "type": "login", "name": "client-1" }
```

Response on success:
```json
{
  "type": "login_success",
  "id": "client-1",
  "clients": ["client-1", "client-2"]
}
```

Response on error:
```json
{ "type": "error", "error": "name_taken" }
```

### 2. Peer notifications

When a new peer connects:
```json
{ "type": "peer_connected", "peer": "client-2" }
```

When a peer disconnects:
```json
{ "type": "peer_disconnected", "peer": "client-2" }
```

### 3. Send messages to specific peers

Include a `target` field to route messages:

```json
{
  "type": "offer",
  "target": "client-2",
  "sdp": "v=0\r\no=- 123456..."
}
```

The recipient receives:
```json
{
  "type": "offer",
  "target": "client-2",
  "from": "client-1",
  "sdp": "v=0\r\no=- 123456..."
}
```

### 4. Broadcast events

These message types are automatically broadcast to all other peers:

| Type | Description |
|------|-------------|
| `stream_started` | Streaming began |
| `stream_stopped` | Streaming ended (include `reason` field) |
| `stream_restored` | Connection recovered after interruption |
| `page_opened` | Browser page became visible |

Example:
```json
{ "type": "stream_stopped", "reason": "user_action" }
```

All other peers receive:
```json
{ "type": "stream_stopped", "from": "client-1", "reason": "user_action" }
```

### 5. Heartbeat

Keep connection alive with application-level ping:

```json
{ "type": "ping" }
```

Response:
```json
{ "type": "pong", "timestamp": 1705312200000 }
```

## Error Handling

### WebSocket close codes

| Code | Reason |
|------|--------|
| 4000 | Client name already taken |
| 4001 | Invalid client name (empty or malformed) |
| 1001 | Server shutting down |

### Error messages

```json
{ "type": "error", "error": "target_not_found", "target": "unknown-peer" }
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | Server port |

Internal limits (in code):
- Max client name: 64 characters
- Max message size: 64KB
- Ping interval: 30 seconds

## Deployment

### Railway

1. Push to GitHub
2. Connect repository to Railway
3. Deploy (auto-detects Node.js)

Railway provides the `PORT` environment variable automatically.

### Docker

```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js .
EXPOSE 8080
CMD ["node", "server.js"]
```

```bash
docker build -t td-signaling .
docker run -p 8080:8080 td-signaling
```

### Fly.io

```bash
fly launch
fly deploy
```

## Client Example (JavaScript)

```javascript
const ws = new WebSocket('wss://your-server.railway.app');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'login', name: 'my-client' }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case 'login_success':
      console.log('Connected! Peers:', msg.clients);
      break;
    case 'peer_connected':
      console.log('New peer:', msg.peer);
      break;
    case 'offer':
      // Handle WebRTC offer from msg.from
      break;
  }
};

// Send WebRTC offer to specific peer
function sendOffer(targetPeer, sdp) {
  ws.send(JSON.stringify({
    type: 'offer',
    target: targetPeer,
    sdp: sdp
  }));
}
```

## License

MIT
