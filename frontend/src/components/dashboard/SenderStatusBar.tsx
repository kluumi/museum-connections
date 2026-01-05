// SenderStatusBar - Connection status badges (Signaling, Receiver, WebRTC)
// Pattern: Extracted from SenderDashboard for better modularity

import {
  ReceiverStatusBadge,
  SignalingBadge,
  WebRTCBadge,
} from "@/components/shared/StatusBadge";
import type { ConnectionState } from "@/constants/connection-states";
import type { NodeId, SenderNodeId } from "@/constants/node-ids";

interface SenderStatusBarProps {
  nodeId: SenderNodeId;
  isSignalingConnected: boolean;
  connectedPeers: NodeId[];
  webrtcConnectionState: ConnectionState;
  targetCity: string;
}

export function SenderStatusBar({
  nodeId,
  isSignalingConnected,
  connectedPeers,
  webrtcConnectionState,
  targetCity,
}: SenderStatusBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      <SignalingBadge connected={isSignalingConnected} />
      <ReceiverStatusBadge
        senderNodeId={nodeId}
        connectedPeers={connectedPeers}
      />
      <WebRTCBadge state={webrtcConnectionState} targetName={targetCity} />
    </div>
  );
}
