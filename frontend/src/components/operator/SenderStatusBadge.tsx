import { Video } from "lucide-react";
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SenderStatusBadgeProps {
  /** Title of the sender (e.g., "Nantes", "Paris") */
  title: string;
  /** Whether the sender is connected to signaling */
  isAvailable: boolean;
}

/**
 * Badge showing sender availability status with tooltip.
 */
export const SenderStatusBadge = memo(function SenderStatusBadge({
  title,
  isAvailable,
}: SenderStatusBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 cursor-help",
            isAvailable
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
              : "text-muted-foreground",
          )}
        >
          <Video className="h-3 w-3" />
          {isAvailable ? "Émetteur prêt" : "Émetteur hors ligne"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Émetteur {title}</p>
          <p className="text-muted-foreground">
            {isAvailable
              ? "L'émetteur est connecté et prêt à diffuser."
              : "L'émetteur n'est pas connecté au serveur."}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
