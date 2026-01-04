# Frontend CLAUDE.md

This file provides comprehensive guidance for the React frontend application.

## Tech Stack

- **React 19** with TypeScript (strict mode)
- **Vite** (ES2024 target) + TailwindCSS 4 plugin
- **TailwindCSS 4** for styling (CSS variables for theming)
- **shadcn/ui** (new-york style, Radix UI-based)
- **TanStack Router v1.144** for file-based routing
- **Zustand v5** for state management (slices, devtools, persist)
- **Biome v2** for linting/formatting
- **Lucide React** for icons

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         React Components                             │
│  (SenderDashboard, VideoSettings, StatsPanel, ConnectionStatus)     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
           ┌────────▼────────┐       ┌────────▼────────┐
           │  Custom Hooks   │       │  Zustand Store  │
           │  (useWebRTC,    │       │  (connection,   │
           │   useSignaling, │◄─────►│   stream,       │
           │   useUserMedia) │       │   devices,      │
           └────────┬────────┘       │   metrics)      │
                    │                └────────┬────────┘
           ┌────────▼────────┐                │
           │    Services     │                │
           │  (SignalingService,              │
           │   WebRTCService)│◄───────────────┘
           └────────┬────────┘    (via eventBus)
                    │
           ┌────────▼────────┐
           │   Event Bus     │
           │  (type-safe     │
           │   pub/sub)      │
           └─────────────────┘
```

## Project Structure

```
frontend/
├── src/
│   ├── main.tsx                    # React 19 entry point (createRoot)
│   ├── config.ts                   # Configuration (URLs, ICE servers, timing)
│   ├── index.css                   # TailwindCSS 4 + CSS variables
│   │
│   ├── routes/                     # TanStack Router (file-based)
│   │   ├── __root.tsx              # Root layout + providers
│   │   ├── index.tsx               # / → Home page
│   │   ├── nantes.tsx              # /nantes → Sender dashboard
│   │   ├── paris.tsx               # /paris → Sender dashboard
│   │   ├── operator.tsx            # /operator → Monitoring dashboard
│   │   ├── obs-nantes.tsx          # /obs-nantes → Fullscreen receiver
│   │   └── obs-paris.tsx           # /obs-paris → Fullscreen receiver
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn/ui (Radix-based primitives)
│   │   │   ├── badge.tsx           # Status badges
│   │   │   ├── button.tsx          # Action buttons
│   │   │   ├── card.tsx            # Container cards
│   │   │   ├── select.tsx          # Dropdown selects
│   │   │   ├── switch.tsx          # Toggle switches
│   │   │   └── ...
│   │   │
│   │   ├── dashboard/              # Sender dashboard components
│   │   │   ├── SenderDashboard.tsx # Main orchestrator (600+ lines)
│   │   │   ├── DeviceSelector.tsx  # Camera/Mic/Speaker dropdowns
│   │   │   ├── VideoSettings.tsx   # Resolution/FPS/Bitrate/Codec
│   │   │   ├── VideoPreview.tsx    # Local video element
│   │   │   ├── ControlButtons.tsx  # Start/Stop buttons
│   │   │   ├── ConnectionStatus.tsx # Status badges
│   │   │   ├── StatsPanel.tsx      # Real-time metrics
│   │   │   └── index.ts            # Barrel export
│   │   │
│   │   ├── operator/               # Operator monitoring
│   │   │   ├── VideoPanel.tsx      # Single video feed + metrics
│   │   │   ├── StatusBar.tsx       # System status
│   │   │   └── index.ts
│   │   │
│   │   ├── receiver/               # OBS fullscreen
│   │   │   ├── FullscreenVideo.tsx # Maximized video
│   │   │   └── index.ts
│   │   │
│   │   ├── shared/                 # Shared UI
│   │   │   ├── ConsoleLog.tsx      # Debug console (French)
│   │   │   ├── StatusIndicator.tsx # Connection indicator
│   │   │   ├── StatusBadge.tsx     # Connection badges
│   │   │   ├── QualityBadge.tsx    # Quality score
│   │   │   └── index.ts
│   │   │
│   │   └── theme/                  # Theming
│   │       ├── ThemeProvider.tsx   # Context provider
│   │       ├── ThemeToggle.tsx     # Light/Dark/System toggle
│   │       └── index.ts
│   │
│   ├── hooks/                      # Custom React hooks
│   │   ├── useWebRTC.ts            # RTCPeerConnection management
│   │   ├── useSignaling.ts         # WebSocket connection
│   │   ├── useMediaDevices.ts      # Device enumeration + capabilities
│   │   ├── useUserMedia.ts         # MediaStream + constraints
│   │   ├── useMetrics.ts           # Per-peer metrics access
│   │   ├── useMetricsSync.ts       # EventBus → Zustand bridge
│   │   └── index.ts
│   │
│   ├── services/                   # Non-React business logic
│   │   ├── signaling.ts            # SignalingService class
│   │   ├── webrtc.ts               # WebRTCService class
│   │   └── index.ts
│   │
│   ├── stores/                     # Zustand state management
│   │   ├── index.ts                # Combined store + useSettingsStore
│   │   ├── connectionSlice.ts      # nodeId, signalingState, peers
│   │   ├── streamSlice.ts          # localStream, remoteStreams, settings
│   │   ├── devicesSlice.ts         # cameras, mics, speakers, capabilities
│   │   └── metricsSlice.ts         # peerMetrics, history
│   │
│   ├── types/                      # TypeScript definitions
│   │   ├── index.ts                # Re-exports
│   │   ├── webrtc.ts               # VideoSettings, constraints
│   │   ├── metrics.ts              # PeerMetrics, history
│   │   └── signaling.ts            # Message types
│   │
│   ├── constants/                  # Application constants
│   │   ├── index.ts
│   │   ├── connection-states.ts    # State enums
│   │   ├── node-ids.ts             # Node configuration
│   │   └── messages.ts             # French UI messages
│   │
│   └── lib/                        # Utilities
│       ├── utils.ts                # cn() class merger
│       └── events.ts               # Type-safe event bus
│
├── biome.json                      # Biome config (tabs, 100 line length)
├── components.json                 # shadcn/ui config
├── tsconfig.json                   # Base TS config
├── tsconfig.app.json               # App TS config (ES2024, React 19)
├── tsconfig.node.json              # Node TS config
├── vite.config.ts                  # Vite + plugins
└── package.json                    # Dependencies
```

## Key Components

### SenderDashboard (Main Orchestrator)

The central component managing sender functionality:

```typescript
// Props
interface SenderDashboardProps {
  nodeId: 'nantes' | 'paris';
}

// Key responsibilities:
// 1. Device enumeration and selection (via useMediaDevices)
// 2. MediaStream acquisition (via useUserMedia)
// 3. WebSocket signaling connection (via useSignaling)
// 4. WebRTC peer connections to targets (via useWebRTC)
// 5. Video settings persistence (via useSettingsStore)
// 6. Camera hot-swap during streaming
// 7. Codec/bitrate application before offer
```

**Critical Flows:**

1. **Initial Load:**
   - Enumerate devices → restore persisted selections
   - Detect camera capabilities → populate resolution/FPS options
   - Load persisted video settings for selected camera
   - Acquire MediaStream with settings
   - Connect to signaling server
   - Apply codec/bitrate → create offers to targets

2. **Camera Change:**
   - Stop old track → request new stream
   - Replace track in all peer connections
   - Load persisted settings for new camera
   - Apply new constraints

3. **Video Settings Change:**
   - Persist to localStorage
   - Apply via `applyVideoConstraints()`
   - Replace track in peers
   - Renegotiate codec if changed

### VideoSettings Component

Video quality controls with camera capability filtering:

```typescript
interface VideoSettingsProps {
  settings: VideoSettings;
  onSettingsChange: (settings: Partial<VideoSettings>) => void;
  cameraCapabilities?: CameraCapabilities | null;
  disabled?: boolean;
}

// Features:
// - Resolution options filtered by camera capabilities
// - FPS options filtered by camera capabilities
// - Warning when >30fps at 1080p (USB bandwidth)
// - Full Auto mode (disables all controls)
```

### StatsPanel Component

Real-time metrics display:

```typescript
// Displays:
// - Video bitrate (kbps)
// - FPS (from outbound-rtp or media-source)
// - Resolution (width x height)
// - Codec (VP8, VP9, H264)
// - RTT (ms)
// - Packet loss (%)
// - Jitter (ms)
// - Quality badge (Excellent/Good/Fair/Poor)
```

## Services

### SignalingService

```typescript
class SignalingService {
  // Connection
  connect(): void;
  disconnect(): void;
  isConnected: boolean;
  state: SignalingState;

  // Message sending
  sendOffer(target: NodeId, offer: RTCSessionDescriptionInit): void;
  sendAnswer(target: NodeId, answer: RTCSessionDescriptionInit): void;
  sendCandidate(target: NodeId, candidate: RTCIceCandidate): void;
  requestOffer(target: NodeId): void;

  // Stream notifications
  notifyStreamStarted(): void;
  notifyStreamStopped(reason: StopReason): void;
  notifyStreamRestored(): void;
  notifyPageOpened(): void;

  // Event handlers
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  once(event: string, handler: Function): void;
}
```

### WebRTCService

```typescript
class WebRTCService {
  // Connection
  connectionState: ConnectionState;
  isConnected: boolean;
  peerConnection: RTCPeerConnection | null;

  // Initialization
  initialize(): void;
  close(): void;

  // Offer/Answer
  createOffer(): Promise<RTCSessionDescriptionInit | null>;
  handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit>;
  handleAnswer(answer: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;

  // Stream management
  setLocalStream(stream: MediaStream): void;
  replaceTrack(track: MediaStreamTrack, kind?: 'video' | 'audio'): Promise<boolean>;

  // Quality settings (IMPORTANT: call before createOffer)
  setPreferredCodec(codec: VideoCodec): void;
  setVideoBitrate(kbps: number): void;

  // Event handlers
  onConnectionStateChange(handler: (state: ConnectionState) => void): void;
  onTrack(handler: (event: RTCTrackEvent) => void): void;
  onMetrics(handler: (metrics: PeerMetrics) => void): void;
}
```

## Custom Hooks

### useMediaDevices

```typescript
function useMediaDevices({ nodeId }: { nodeId: 'nantes' | 'paris' }) {
  return {
    // Available devices
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
    speakers: MediaDeviceInfo[];

    // Current selections (persisted per node)
    selectedCameraId: string | null;
    selectedMicrophoneId: string | null;
    selectedSpeakerId: string | null;

    // Camera capabilities
    cameraCapabilities: CameraCapabilities | null;

    // Actions
    enumerateDevices(): Promise<{ cameraId, microphoneId }>;
    selectCamera(deviceId: string | null): Promise<void>;
    selectMicrophone(deviceId: string | null): void;
    selectSpeaker(deviceId: string | null): void;
  };
}
```

### useUserMedia

```typescript
function useUserMedia(options: {
  autoStart?: boolean;
  videoSettings?: VideoSettings;
}) {
  return {
    stream: MediaStream | null;
    isLoading: boolean;
    error: Error | null;

    // Actions
    start(overrides?: { cameraId?, microphoneId? }): Promise<MediaStream>;
    stop(): void;
    restart(): Promise<MediaStream>;

    // Track management
    replaceVideoTrack(deviceId: string): Promise<MediaStreamTrack | null>;
    replaceAudioTrack(deviceId: string): Promise<MediaStreamTrack | null>;
    applyVideoConstraints(settings: VideoSettings): Promise<ApplyConstraintsResult | null>;

    // Toggles
    toggleVideo(enabled?: boolean): void;
    toggleAudio(enabled?: boolean): void;
  };
}
```

### useSignaling

```typescript
function useSignaling(nodeId: NodeId, options?: {
  onMessage?: (message: SignalingMessage) => void;
}) {
  return {
    service: SignalingService | null;
    state: SignalingState;
    isConnected: boolean;
    connectedPeers: NodeId[];
  };
}
```

### useWebRTC

```typescript
function useWebRTC(
  localNodeId: NodeId,
  remoteNodeId: NodeId,
  signaling: SignalingService | null,
  options?: {
    localStream?: MediaStream;
    onTrack?: (event: RTCTrackEvent) => void;
    onMetrics?: (metrics: PeerMetrics) => void;
  }
) {
  return {
    service: WebRTCService | null;
    connectionState: ConnectionState;
    remoteStream: MediaStream | null;

    // Exposed service methods
    createOffer: () => Promise<RTCSessionDescriptionInit | null>;
    handleOffer: (offer) => Promise<RTCSessionDescriptionInit>;
    handleAnswer: (answer) => Promise<void>;
    addIceCandidate: (candidate) => Promise<void>;
    setLocalStream: (stream) => void;
    replaceTrack: (track, kind?) => Promise<boolean>;
    setPreferredCodec: (codec) => void;
    setVideoBitrate: (kbps) => void;
    close: () => void;
  };
}
```

## State Management

### Store Slices

```typescript
// connectionSlice
interface ConnectionState {
  nodeId: NodeId | null;
  signalingState: SignalingState;
  connectedPeers: Set<NodeId>;
  peerConnectionStates: Map<NodeId, ConnectionState>;

  setNodeId(id: NodeId | null): void;
  setSignalingState(state: SignalingState): void;
  addConnectedPeer(peerId: NodeId): void;
  removeConnectedPeer(peerId: NodeId): void;
  setPeerConnectionState(peerId: NodeId, state: ConnectionState): void;
}

// streamSlice
interface StreamState {
  localStream: MediaStream | null;
  streamState: StreamState;
  manuallyStopped: boolean;
  networkLost: boolean;
  remoteStreams: Map<NodeId, MediaStream>;
  videoSettings: VideoSettings;
  sourceStates: Map<NodeId, SourceState>;

  setLocalStream(stream: MediaStream | null): void;
  addRemoteStream(nodeId: NodeId, stream: MediaStream): void;
  setVideoSettings(settings: Partial<VideoSettings>): void;
  setSourceState(nodeId: NodeId, state: SourceState): void;
}

// devicesSlice
interface DevicesState {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  selectedSpeakerId: string | null;
  cameraCapabilities: CameraCapabilities | null;
  devicesLoading: boolean;
  devicesError: Error | null;

  setDevices(devices: MediaDeviceInfo[]): void;
  setSelectedCamera(id: string | null): void;
  setCameraCapabilities(caps: CameraCapabilities | null): void;
}

// metricsSlice
interface MetricsState {
  peerMetrics: Map<NodeId, PeerMetrics>;
  metricsHistory: Map<NodeId, MetricsHistory>;
  historyMaxSamples: number;

  updatePeerMetrics(peerId: NodeId, metrics: PeerMetrics): void;
  removePeerMetrics(peerId: NodeId): void;
}
```

### Persisted Settings Store

```typescript
// useSettingsStore (localStorage persistence)
interface SettingsStore {
  theme: 'light' | 'dark' | 'system';
  setTheme(theme): void;

  // Per-device video settings keyed by "nodeId:cameraId"
  getVideoSettings(nodeId: NodeId, cameraId: string | null): VideoSettings;
  setVideoSettings(nodeId: NodeId, cameraId: string | null, settings: Partial<VideoSettings>): void;

  // Per-node device selections
  getSelectedDevices(nodeId: NodeId): { cameraId, microphoneId, speakerId };
  setSelectedDevices(nodeId: NodeId, devices: Partial<{...}>): void;
}
```

## Type Definitions

### Video Types

```typescript
type VideoResolution = 'auto' | '1080p' | '720p' | '480p (16:9)' | 'VGA (4:3)' | '360p' | 'QVGA';
type VideoFps = 'auto' | number;  // 15, 24, 25, 30, 50, 60, 120
type VideoBitrate = 'auto' | number;  // kbps: 500, 1000, 2000, 3000, 5000, 8000
type VideoCodec = 'auto' | 'VP8' | 'VP9' | 'H264';
type VideoMode = 'manual' | 'auto';

interface VideoSettings {
  mode: VideoMode;
  resolution: VideoResolution;
  fps: VideoFps;
  bitrate: VideoBitrate;
  codec: VideoCodec;
}

interface CameraCapabilities {
  maxWidth: number;
  maxHeight: number;
  maxFrameRate: number;
  supportedResolutions: Array<{ width, height, label }>;
  supportedFrameRates: number[];
}

// Resolution constraints lookup
const RESOLUTION_CONSTRAINTS = {
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
  '480p (16:9)': { width: 854, height: 480 },
  'VGA (4:3)': { width: 640, height: 480 },
  '360p': { width: 640, height: 360 },
  'QVGA': { width: 320, height: 240 },
};
```

### Metrics Types

```typescript
interface PeerMetrics {
  peerId: string;
  timestamp: number;
  video: {
    bitrate: number;       // kbps
    fps: number;
    width: number;
    height: number;
    codec: string;
    packetLoss: number;    // percentage
    jitter: number;        // ms
    framesDropped: number;
    framesReceived: number;
    framesSent: number;
  };
  audio: {
    bitrate: number;
    packetLoss: number;
    jitter: number;
    audioLevel: number;
  };
  connection: {
    rtt: number;           // ms
    localCandidateType: string;
    remoteCandidateType: string;
    protocol: string;
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
    packetsLost: number;
  };
  qualityScore: number;    // 0-100
}

interface MetricsHistory {
  timestamps: number[];    // Rolling 60 samples
  bitrates: number[];
  fps: number[];
  rtt: number[];
  packetLoss: number[];
}
```

## Commands

```bash
# Development
npm run dev              # Start Vite dev server (localhost:5173)
npm run build            # TypeScript check + Vite build
npm run preview          # Preview production build

# Code quality
npm run lint             # Biome check
npm run lint:fix         # Biome check --fix
npm run format           # Biome format --write
npm run check            # lint:fix + typecheck
npm run typecheck        # tsc --noEmit

# shadcn/ui
npx shadcn@latest add <component>   # Add new component
```

## Coding Standards

### Component Pattern

```typescript
// Props interface with JSDoc
interface MyComponentProps {
  /** Node identifier */
  nodeId: NodeId;
  /** Optional callback */
  onAction?: () => void;
}

// Functional component with explicit return
export function MyComponent({ nodeId, onAction }: MyComponentProps) {
  // Hooks at top
  const [state, setState] = useState(initialValue);
  const { data } = useStore();

  // Callbacks with useCallback for stability
  const handleAction = useCallback(() => {
    onAction?.();
  }, [onAction]);

  // Effects
  useEffect(() => {
    // ...
  }, [dependencies]);

  // Early returns for loading/error states
  if (!data) return <Loading />;

  // Main render
  return (
    <div className={cn('base-styles', conditionalStyle && 'conditional')}>
      {/* ... */}
    </div>
  );
}
```

### Hook Pattern

```typescript
interface UseMyHookOptions {
  param: string;
  onEvent?: (data: Data) => void;
}

export function useMyHook({ param, onEvent }: UseMyHookOptions) {
  // Refs for callbacks (avoid stale closures)
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // State
  const [data, setData] = useState<Data | null>(null);

  // Service ref
  const serviceRef = useRef<MyService | null>(null);

  // Initialize service
  useEffect(() => {
    serviceRef.current = new MyService({
      onData: (d) => {
        setData(d);
        onEventRef.current?.(d);
      }
    });

    return () => {
      serviceRef.current?.cleanup();
    };
  }, [param]);

  // Return stable references
  return {
    data,
    service: serviceRef.current,
    action: useCallback(() => serviceRef.current?.doAction(), []),
  };
}
```

### Store Pattern (Zustand Slice)

```typescript
import { type StateCreator } from 'zustand';

export interface MySlice {
  data: Data | null;
  setData: (data: Data) => void;
  clearData: () => void;
}

export const createMySlice: StateCreator<
  CombinedState,
  [],
  [],
  MySlice
> = (set) => ({
  data: null,
  setData: (data) => set({ data }),
  clearData: () => set({ data: null }),
});
```

## Debugging

### Console Log Prefixes

```
✅ Success / Connected
❌ Error / Failed
📩 Incoming message
🔄 Retry / Recovery
🎬 Media received
🔌 WebSocket connection
📡 State change / Offer request
📊 Stats / Metrics
⏹️ Stream stopped
▶️ Stream started
📹 Camera / Video track
🎤 Microphone / Audio track
⚠️ Warning
```

### Debug Hooks

```typescript
// In SenderDashboard - logs metrics updates
useEffect(() => {
  if (metrics) {
    console.log("📊 StatsPanel metrics updated:", {
      peerId: primaryTarget,
      fps: metrics.video.fps,
      bitrate: metrics.video.bitrate,
      width: metrics.video.width,
      height: metrics.video.height,
      codec: metrics.video.codec,
    });
  }
}, [metrics, primaryTarget]);
```

### Stats Collection Debug

The WebRTCService logs raw stats on first collection:
- `📊 Stats report types found: {outboundRtp, inboundRtp, mediaSource, codecCount}`
- `📊 outbound-rtp raw values: {frameWidth, frameHeight, framesPerSecond, bytesSent, codecId}`
- `📊 media-source raw values: {width, height, framesPerSecond}`

## Common Issues

### Codec not applied on page load
**Cause:** `setPreferredCodec()` called after `createOffer()`
**Fix:** Call before `createOffer()` in auto-start and request_offer handlers

### Metrics showing "-" for bitrate/FPS
**Cause:** Stats require 2 samples for delta calculation
**Fix:** Wait ~2-4 seconds after connection; check `outbound-rtp` report type

### Camera limited to 30fps at 1080p
**Cause:** USB bandwidth limitation
**Fix:** Use 720p or lower for higher FPS

### Device selection not persisted
**Cause:** Using wrong nodeId key
**Fix:** Ensure `useMediaDevices({ nodeId })` matches route
