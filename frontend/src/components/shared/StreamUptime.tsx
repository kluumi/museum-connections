import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface StreamUptimeProps {
  /** Whether the stream is currently active */
  isStreaming: boolean;
  /** Optional start timestamp (if not provided, starts when isStreaming becomes true) */
  startTime?: number;
  /** Size variant */
  size?: "sm" | "md";
  /** Custom class name */
  className?: string;
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Displays the uptime of a stream with a live counter
 */
export function StreamUptime({
  isStreaming,
  startTime,
  size = "md",
  className,
}: StreamUptimeProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [internalStartTime, setInternalStartTime] = useState<number | null>(
    null,
  );

  // Track when streaming starts/stops
  useEffect(() => {
    if (isStreaming) {
      // Use provided startTime or current time
      const start = startTime ?? Date.now();
      setInternalStartTime(start);
      // Calculate initial elapsed time if startTime was provided
      if (startTime) {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      } else {
        setElapsedSeconds(0);
      }
    } else {
      setInternalStartTime(null);
      setElapsedSeconds(0);
    }
  }, [isStreaming, startTime]);

  // Update counter every second while streaming
  useEffect(() => {
    if (!isStreaming || internalStartTime === null) {
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - internalStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isStreaming, internalStartTime]);

  if (!isStreaming) {
    return null;
  }

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-mono tabular-nums cursor-help",
        "text-muted-foreground",
        size === "sm" && "text-xs px-1.5 py-0.5",
        className,
      )}
    >
      <Timer
        className={cn("shrink-0", size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")}
      />
      {formatDuration(elapsedSeconds)}
    </Badge>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="text-sm">
          <p className="font-medium">Durée de diffusion</p>
          <p className="text-muted-foreground">
            Flux actif depuis {formatDuration(elapsedSeconds)}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
