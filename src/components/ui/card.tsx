import * as React from "react";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = "", style, ...props }, ref) => (
  <div
    ref={ref}
    className={`ui-card ${className}`.trim()}
    style={{
      background: 'var(--card)',
      color: 'var(--card-foreground)',
      borderRadius: 'var(--radius-lg, 0.625rem)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      ...style,
    }}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "stripe" }
>(({ className = "", variant = "default", style, ...props }, ref) => (
  <div
    ref={ref}
    className={`ui-card-header ${className}`.trim()}
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
      padding: '1.125rem 1.5rem',
      background: variant === "stripe" ? 'var(--card-header-bg)' : 'transparent',
      borderBottom: variant === "stripe" ? '1px solid var(--border)' : 'none',
      ...style,
    }}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className = "", style, ...props }, ref) => (
  <h3
    ref={ref}
    className={`ui-card-title ${className}`.trim()}
    style={{
      fontSize: '0.9375rem',
      fontWeight: 600,
      letterSpacing: '-0.02em',
      color: 'var(--foreground)',
      margin: 0,
      fontFamily: 'var(--font-display)',
      lineHeight: 1.3,
      ...style,
    }}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className = "", style, ...props }, ref) => (
  <p
    ref={ref}
    className={`ui-card-description ${className}`.trim()}
    style={{
      fontSize: '0.8125rem',
      color: 'var(--muted-foreground)',
      margin: 0,
      lineHeight: 1.5,
      ...style,
    }}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = "", style, ...props }, ref) => (
  <div
    ref={ref}
    className={`ui-card-content ${className}`.trim()}
    style={{
      padding: '1.25rem 1.5rem',
      ...style,
    }}
    {...props}
  />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = "", style, ...props }, ref) => (
  <div
    ref={ref}
    className={`ui-card-footer ${className}`.trim()}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.875rem 1.5rem',
      background: 'var(--card-header-bg)',
      borderTop: '1px solid var(--border)',
      ...style,
    }}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
