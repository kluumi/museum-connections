import { createFileRoute } from "@tanstack/react-router";
import { SenderDashboard } from "@/components/dashboard";
import { NodeId } from "@/constants/node-ids";
import { usePageTitle } from "@/hooks";

export const Route = createFileRoute("/senders/paris")({
  component: ParisDashboard,
});

function ParisDashboard() {
  usePageTitle("Console Paris");

  return (
    <SenderDashboard
      nodeId={NodeId.PARIS}
      accentColor="paris"
      cityEmoji="🗼"
      cityName="Paris"
    />
  );
}
