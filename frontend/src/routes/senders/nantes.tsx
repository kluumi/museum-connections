import { createFileRoute } from "@tanstack/react-router";
import { SenderDashboard } from "@/components/dashboard";
import { NodeId } from "@/constants/node-ids";
import { usePageTitle } from "@/hooks";

export const Route = createFileRoute("/senders/nantes")({
  component: NantesDashboard,
});

function NantesDashboard() {
  usePageTitle("Console Nantes");

  return (
    <SenderDashboard
      nodeId={NodeId.NANTES}
      accentColor="nantes"
      cityEmoji="🐘"
      cityName="Nantes"
    />
  );
}
