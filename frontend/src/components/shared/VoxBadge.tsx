import { Mic, MicOff } from "lucide-react";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VoxBadgeProps {
  /** Badge type: speaking (this sender is talking) or muted (this sender is muted by the other) */
  type: "speaking" | "muted";
}

/**
 * Badge showing VOX (Voice-Operated Switch) status.
 * speaking = This sender is speaking (the other is muted)
 * muted = This sender is muted (the other is speaking)
 */
export const VoxBadge = memo(function VoxBadge({ type }: VoxBadgeProps) {
  const isSpeaking = type === "speaking";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={
            isSpeaking
              ? "gap-1 cursor-help border-emerald-500/30 bg-emerald-500/10 text-emerald-500 animate-pulse"
              : "gap-1 cursor-help border-red-500/30 bg-red-500/10 text-red-500 animate-pulse"
          }
        >
          {isSpeaking ? (
            <Mic className="h-3 w-3" />
          ) : (
            <MicOff className="h-3 w-3" />
          )}
          {isSpeaking ? "Parle" : "Muet"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            {isSpeaking ? "En train de parler" : "Micro coupé"}
          </p>
          <p className="text-muted-foreground">
            {isSpeaking
              ? "Cet émetteur parle, l'autre est automatiquement coupé."
              : "L'autre émetteur parle, ce micro est automatiquement coupé."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
