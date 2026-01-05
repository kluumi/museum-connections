// SenderBlockedOverlay - Error overlay when duplicate sender detected
// Pattern: Extracted from SenderDashboard for better modularity

import { RotateCcw, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SenderBlockedOverlayProps {
  message: string;
}

export function SenderBlockedOverlay({ message }: SenderBlockedOverlayProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <VideoOff className="h-10 w-10 text-destructive" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-destructive">
            Émetteur déjà actif
          </h1>
          <p className="text-muted-foreground">{message}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Fermez cet onglet et utilisez l'onglet existant, ou fermez l'autre
          onglet puis rafraîchissez cette page.
        </p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Rafraîchir la page
        </Button>
      </div>
    </div>
  );
}
