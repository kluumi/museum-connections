import { createFileRoute } from "@tanstack/react-router";
import { BlockedOverlay, FullscreenVideo } from "@/components/receiver";
import {
  getNodeDisplayName,
  NodeId,
  RECEIVER_SOURCE,
} from "@/constants/node-ids";
import { useReceiverManager } from "@/hooks/useReceiverManager";

export const Route = createFileRoute("/receivers/obs-nantes")({
  component: ObsNantesReceiver,
});

function ObsNantesReceiver() {
  const nodeId = NodeId.OBS_NANTES;
  const sourceId = RECEIVER_SOURCE[nodeId]; // "paris"
  const displayName = getNodeDisplayName(nodeId);

  const receiver = useReceiverManager({
    nodeId,
    sourceId,
    autoConnect: true,
  });

  // Show blocking overlay if duplicate OBS receiver detected
  if (receiver.blockedMessage) {
    return (
      <BlockedOverlay
        displayName={displayName}
        message={receiver.blockedMessage}
      />
    );
  }

  return <FullscreenVideo stream={receiver.remoteStream} />;
}
