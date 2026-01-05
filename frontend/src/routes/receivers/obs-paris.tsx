import { createFileRoute } from "@tanstack/react-router";
import { BlockedOverlay, FullscreenVideo } from "@/components/receiver";
import {
  getNodeDisplayName,
  NodeId,
  RECEIVER_SOURCE,
} from "@/constants/node-ids";
import { useReceiverManager } from "@/hooks/useReceiverManager";

export const Route = createFileRoute("/receivers/obs-paris")({
  component: ObsParisReceiver,
});

function ObsParisReceiver() {
  const nodeId = NodeId.OBS_PARIS;
  const sourceId = RECEIVER_SOURCE[nodeId]; // "nantes"
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
