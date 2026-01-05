import { ArrowUpDown, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BandwidthUsageIndicatorProps {
  currentBitrate: number;
  availableBandwidth: number;
}

function formatBitrate(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  if (kbps >= 1) {
    return `${Math.round(kbps)} kbps`;
  }
  return `${kbps.toFixed(1)} kbps`;
}

function getUsageColor(percent: number | null): string {
  if (percent === null) return "text-muted-foreground";
  if (percent > 90) return "text-red-500";
  if (percent > 70) return "text-amber-500";
  if (percent > 50) return "text-lime-500";
  return "text-emerald-500";
}

function getUsageBackground(percent: number | null): string {
  if (percent === null) return "bg-muted";
  if (percent > 90) return "bg-red-500/10";
  if (percent > 70) return "bg-amber-500/10";
  if (percent > 50) return "bg-lime-500/10";
  return "bg-emerald-500/10";
}

function getProgressColor(percent: number): string {
  if (percent > 90) return "bg-red-500";
  if (percent > 70) return "bg-amber-500";
  if (percent > 50) return "bg-lime-500";
  return "bg-emerald-500";
}

export function BandwidthUsageIndicator({
  currentBitrate,
  availableBandwidth,
}: BandwidthUsageIndicatorProps) {
  // If no bandwidth data available (common for receivers), show "N/A" instead of misleading 0%
  // Also treat unrealistic values as unavailable:
  // - WebRTC's availableBandwidth estimation can be unreliable initially
  // - If reported bandwidth is lower than actual bitrate, the estimate is clearly wrong
  const isReliable =
    availableBandwidth > 0 && availableBandwidth >= currentBitrate * 0.5;
  const hasBandwidthData = isReliable;
  const usagePercent = hasBandwidthData
    ? Math.min(100, (currentBitrate / availableBandwidth) * 100)
    : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-3 cursor-help">
          <div
            className={cn("rounded-lg p-2", getUsageBackground(usagePercent))}
          >
            <ArrowUpDown
              className={cn("h-4 w-4", getUsageColor(usagePercent))}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground">Utilisation</p>
              <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
            </div>
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "font-mono text-sm font-medium",
                  getUsageColor(usagePercent),
                )}
              >
                {usagePercent !== null ? `${usagePercent.toFixed(0)}%` : "N/A"}
              </p>
              {hasBandwidthData && usagePercent !== null && (
                <div className="flex-1 max-w-24">
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        getProgressColor(usagePercent),
                      )}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">Utilisation bande passante</p>
          {hasBandwidthData ? (
            <>
              <div className="space-y-0.5 text-xs">
                <p>
                  <span className="text-emerald-500">■</span> 0-50% : Excellent
                </p>
                <p>
                  <span className="text-lime-500">■</span> 50-70% : Bon
                </p>
                <p>
                  <span className="text-amber-500">■</span> 70-90% : Limite
                </p>
                <p>
                  <span className="text-red-500">■</span> &gt;90% : Saturé
                </p>
              </div>
              <p className="text-muted-foreground pt-1">
                {formatBitrate(currentBitrate)} utilisé sur{" "}
                {formatBitrate(availableBandwidth)} disponible.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              {availableBandwidth > 0
                ? "Estimation non fiable (bande passante rapportée inférieure au bitrate actuel)."
                : "Donnée non disponible pour les récepteurs."}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
