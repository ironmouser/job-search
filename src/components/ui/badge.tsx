import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "destructive";
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className = "", variant = "default", style, children, ...props }, ref) => {
    let bg = "rgba(0, 112, 243, 0.12)";
    let color = "var(--primary, #0070f3)";
    let border = "1px solid rgba(0, 112, 243, 0.25)";

    switch (variant) {
      case "secondary":
        bg = "var(--muted)";
        color = "var(--muted-foreground)";
        border = "1px solid var(--border)";
        break;
      case "outline":
        bg = "transparent";
        color = "var(--foreground)";
        border = "1px solid var(--border-solid, var(--border))";
        break;
      case "success":
        bg = "rgba(16, 185, 129, 0.12)";
        color = "#10b981";
        border = "1px solid rgba(16, 185, 129, 0.25)";
        break;
      case "warning":
        bg = "rgba(245, 158, 11, 0.12)";
        color = "#d97706";
        border = "1px solid rgba(245, 158, 11, 0.25)";
        break;
      case "destructive":
        bg = "rgba(239, 68, 68, 0.12)";
        color = "#ef4444";
        border = "1px solid rgba(239, 68, 68, 0.25)";
        break;
    }

    return (
      <div
        ref={ref}
        className={cn("ui-badge", className)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.2rem 0.625rem",
          borderRadius: "9999px",
          fontSize: "0.75rem",
          fontWeight: 500,
          lineHeight: "1.25",
          whiteSpace: "nowrap",
          background: bg,
          color: color,
          border: border,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Badge.displayName = "Badge";
