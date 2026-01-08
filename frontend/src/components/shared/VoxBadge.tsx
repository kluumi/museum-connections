import { Mic, Volume2 } from "lucide-react";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VoxBadgeProps {
  /** Badge type: TX (transmitting/speaking) or RX (receiving/ducked) */
  type: "tx" | "rx";
}

/**
 * Badge showing VOX (Voice-Operated Switch) status.
 * TX = This sender is speaking (triggering ducking on the other)
 * RX = This sender is being ducked (the other is speaking)
 */
export const VoxBadge = memo(function VoxBadge({ type }: VoxBadgeProps) {
  const isTx = type === "tx";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={
            isTx
              ? "gap-1 cursor-help border-emerald-500/30 bg-emerald-500/10 text-emerald-500 animate-pulse"
              : "gap-1 cursor-help border-orange-500/30 bg-orange-500/10 text-orange-500 animate-pulse"
          }
        >
          {isTx ? <Mic className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          {isTx ? "TX" : "RX"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">{isTx ? "VOX actif" : "Audio réduit"}</p>
          <p className="text-muted-foreground">
            {isTx
              ? "Cet émetteur parle, l'autre est automatiquement baissé."
              : "L'autre émetteur parle, le volume est automatiquement réduit."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
