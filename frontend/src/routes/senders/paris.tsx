import { createFileRoute } from "@tanstack/react-router";
import { SenderDashboard } from "@/components/dashboard";
import { NodeId } from "@/constants/node-ids";

export const Route = createFileRoute("/senders/paris")({
  component: ParisDashboard,
});

function ParisDashboard() {
  return (
    <SenderDashboard
      nodeId={NodeId.PARIS}
      accentColor="paris"
      cityEmoji="🗼"
      cityName="Paris"
    />
  );
}
