import { cn } from "@/lib/utils";

export type StatusType = "online" | "pending" | "offline";

interface StatusIndicatorProps {
  status: StatusType;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusStyles: Record<StatusType, string> = {
  online: "bg-[var(--status-online)] shadow-[0_0_8px_var(--status-online)]",
  pending:
    "bg-[var(--status-pending)] shadow-[0_0_8px_var(--status-pending)] animate-pulse",
  offline: "bg-[var(--status-offline)]",
};

const sizeStyles = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

const statusLabels: Record<StatusType, string> = {
  online: "En ligne",
  pending: "En attente",
  offline: "Hors ligne",
};

export function StatusIndicator({
  status,
  size = "md",
  className,
}: StatusIndicatorProps) {
  return (
    <span
      role="img"
      className={cn(
        "inline-block rounded-full",
        sizeStyles[size],
        statusStyles[status],
        className,
      )}
      aria-label={statusLabels[status]}
    />
  );
}
