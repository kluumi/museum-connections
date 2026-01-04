# WebRTC Dashboard - React Frontend

Modern React + TypeScript frontend for the WebRTC bidirectional video streaming system.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.3 | UI framework |
| TypeScript | 5.9.3 | Type safety |
| Vite | 7.3.0 | Build tool & dev server |
| TailwindCSS | 4.1.18 | Styling |
| TanStack Router | 1.144.0 | File-based routing |
| Zustand | 5.0.9 | State management |
| Biome | 2.3.10 | Linting & formatting |
| Lucide React | 0.562.0 | Icons |

## Getting Started

### Prerequisites

- Node.js 24+ (see `.nvmrc` in root)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens at http://localhost:5173 with hot module replacement.

### Build

```bash
npm run build
```

Output in `dist/` directory, ready for static hosting.

### Linting & Formatting

```bash
npm run lint          # Check for issues
npm run lint:fix      # Fix auto-fixable issues
npm run format        # Format code
```

## Project Structure

```
frontend/
├── src/
│   ├── main.tsx          # React entry point
│   ├── App.tsx           # Main app component
│   ├── index.css         # Global styles (TailwindCSS)
│   ├── lib/
│   │   └── utils.ts      # Utility functions (cn, etc.)
│   └── assets/           # Static assets
│
├── public/               # Public assets (copied to dist)
├── index.html            # HTML template
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript config (base)
├── tsconfig.app.json     # App-specific TS config
├── tsconfig.node.json    # Build-specific TS config
├── biome.json            # Biome linter/formatter config
├── components.json       # UI component library config
└── package.json          # Dependencies
```

## Development Status

**Current State:** Scaffolded boilerplate. Core WebRTC dashboard UI not yet implemented.

### Planned Features

- [ ] Dashboard views for Nantes/Paris senders
- [ ] Operator monitoring dashboard
- [ ] Device selection (camera, microphone)
- [ ] Video settings controls (resolution, FPS, bitrate, codec)
- [ ] Real-time metrics display (RTT, packet loss, jitter)
- [ ] Quality badges and status indicators
- [ ] WebSocket signaling integration
- [ ] WebRTC peer connection management

### Integration Points

The React app will need to integrate with:

1. **Signaling Server** (`../server-signaling/`)
   - WebSocket connection for peer discovery
   - SDP offer/answer exchange
   - ICE candidate relay

2. **Legacy Code Reference** (root level)
   - `config.js` - Configuration constants
   - `ResilientSignaling` class - WebSocket with auto-reconnect
   - `ResilientPeerConnection` class - RTCPeerConnection wrapper
   - `WebRTCMetrics` class - Statistics collection

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run Biome linter |
| `npm run lint:fix` | Fix linting issues |
| `npm run format` | Format code with Biome |

## Configuration Files

### vite.config.ts

- React plugin with SWC
- TailwindCSS integration
- TanStack Router plugin for file-based routing
- Path alias: `@` -> `./src`

### biome.json

- Indent: 2 spaces
- Quote style: double
- Semicolons: required
- Trailing commas: all

### tsconfig.json

- Target: ES2020
- Strict mode enabled
- Path mapping: `@/*` -> `src/*`

## Styling

Uses TailwindCSS 4 with the `@tailwindcss/vite` plugin. Utility classes available throughout the app.

Helper function in `src/lib/utils.ts`:
```typescript
import { cn } from "@/lib/utils";

// Merge class names with conflict resolution
<div className={cn("base-class", conditional && "conditional-class")} />
```

## State Management

Zustand is configured for lightweight state management. Create stores in `src/stores/` as needed:

```typescript
import { create } from 'zustand';

interface StreamState {
  isStreaming: boolean;
  setStreaming: (value: boolean) => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  isStreaming: false,
  setStreaming: (value) => set({ isStreaming: value }),
}));
```

## Routing

TanStack Router with file-based routing is configured. Routes are generated from the file structure in `src/routes/`.

Example route file structure:
```
src/routes/
├── __root.tsx           # Root layout
├── index.tsx            # Home page (/)
├── nantes.tsx           # Nantes dashboard (/nantes)
├── paris.tsx            # Paris dashboard (/paris)
└── operator.tsx         # Operator view (/operator)
```
