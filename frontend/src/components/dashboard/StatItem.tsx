import { HelpCircle } from "lucide-react";
import { memo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type WarningSeverity = "none" | "warning" | "error";

export interface TooltipInfo {
  title: string;
  description: string;
  thresholds?: {
    excellent?: string;
    good?: string;
    warning?: string;
    error?: string;
  };
}

const severityStyles = {
  none: { bg: "", icon: "text-muted-foreground", text: "text-emerald-500" },
  warning: {
    bg: "bg-amber-500/20",
    icon: "text-amber-500",
    text: "text-amber-500",
  },
  error: { bg: "bg-red-500/20", icon: "text-red-500", text: "text-red-500" },
};

interface StatItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  severity?: WarningSeverity;
  tooltip?: TooltipInfo;
}

export const StatItem = memo(function StatItem({
  icon: Icon,
  label,
  value,
  subValue,
  severity = "none",
  tooltip,
}: StatItemProps) {
  const currentStyle = severityStyles[severity];

  const content = (
    <div className="flex items-center gap-3">
      <div className={cn("rounded-lg bg-muted p-2", currentStyle.bg)}>
        <Icon className={cn("h-4 w-4", currentStyle.icon)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          {tooltip && (
            <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
          )}
        </div>
        <p className={cn("font-mono text-sm font-medium", currentStyle.text)}>
          {value}
          {subValue && (
            <span className="ml-1 text-xs text-muted-foreground">
              {subValue}
            </span>
          )}
        </p>
      </div>
    </div>
  );

  if (!tooltip) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">{content}</div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1 text-sm">
          <p className="font-medium">{tooltip.title}</p>
          {tooltip.thresholds && (
            <div className="space-y-0.5 text-xs">
              {tooltip.thresholds.excellent && (
                <p>
                  <span className="text-emerald-500">■</span>{" "}
                  {tooltip.thresholds.excellent}
                </p>
              )}
              {tooltip.thresholds.good && (
                <p>
                  <span className="text-lime-500">■</span>{" "}
                  {tooltip.thresholds.good}
                </p>
              )}
              {tooltip.thresholds.warning && (
                <p>
                  <span className="text-amber-500">■</span>{" "}
                  {tooltip.thresholds.warning}
                </p>
              )}
              {tooltip.thresholds.error && (
                <p>
                  <span className="text-red-500">■</span>{" "}
                  {tooltip.thresholds.error}
                </p>
              )}
            </div>
          )}
          <p className="text-muted-foreground pt-1">{tooltip.description}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});
