// BlockedOverlay - Shown when a duplicate receiver is detected
import { MonitorOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BlockedOverlayProps {
  displayName: string;
  message: string;
}

export function BlockedOverlay({ displayName, message }: BlockedOverlayProps) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center">
            <MonitorOff className="h-10 w-10 text-red-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-red-400">
            {displayName} déjà actif
          </h1>
          <p className="text-white/60">{message}</p>
        </div>
        <p className="text-sm text-white/40">
          Fermez cet onglet et utilisez l'onglet existant, ou fermez l'autre
          onglet puis rafraîchissez cette page.
        </p>
        <Button
          variant="outline"
          className="border-white/20 bg-transparent text-white hover:bg-white/10"
          onClick={() => window.location.reload()}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Rafraîchir la page
        </Button>
      </div>
    </div>
  );
}
