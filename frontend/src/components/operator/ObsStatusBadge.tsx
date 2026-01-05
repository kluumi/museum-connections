import { Monitor } from "lucide-react";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ObsStatusBadgeProps {
  /** Whether the OBS receiver is connected */
  isConnected: boolean;
}

/**
 * Badge showing OBS receiver connection status with tooltip.
 */
export const ObsStatusBadge = memo(function ObsStatusBadge({
  isConnected,
}: ObsStatusBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 cursor-help",
            isConnected
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "text-muted-foreground",
          )}
        >
          <Monitor className="h-3 w-3" />
          {isConnected ? "OBS prêt" : "OBS hors ligne"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Récepteur OBS</p>
          <p className="text-muted-foreground">
            {isConnected
              ? "Le récepteur OBS est connecté et prêt à recevoir le flux."
              : "Le récepteur OBS n'est pas connecté au serveur."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
