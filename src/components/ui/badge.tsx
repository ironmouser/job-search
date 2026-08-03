import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "destructive";
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className = "", variant = "default", style, children, ...props }, ref) => {
    let bg = 'rgba(0, 112, 243, 0.12)';
    let color = '#60a5fa';
    let border = '1px solid rgba(0, 112, 243, 0.2)';

    switch (variant) {
      case "secondary":
        bg = 'var(--muted)';
        color = 'var(--muted-foreground)';
        border = '1px solid var(--border)';
        break;
      case "outline":
        bg = 'transparent';
        color = 'var(--foreground)';
        border = '1px solid var(--border)';
        break;
      case "success":
        bg = 'rgba(16, 185, 129, 0.1)';
        color = '#34d399';
        border = '1px solid rgba(16, 185, 129, 0.2)';
        break;
      case "warning":
        bg = 'rgba(245, 158, 11, 0.1)';
        color = '#fbbf24';
        border = '1px solid rgba(245, 158, 11, 0.2)';
        break;
      case "destructive":
        bg = 'rgba(239, 68, 68, 0.1)';
        color = '#f87171';
        border = '1px solid rgba(239, 68, 68, 0.2)';
        break;
    }

    return (
      <div
        ref={ref}
        className={`ui-badge ${className}`.trim()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem',
          padding: '0.15rem 0.575rem',
          borderRadius: '9999px',
          fontSize: '0.6875rem',
          fontWeight: 500,
          lineHeight: '1.25',
          whiteSpace: 'nowrap',
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
