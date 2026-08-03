import * as React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    background: 'var(--primary)',
    color: 'var(--primary-foreground)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--secondary)',
    color: 'var(--secondary-foreground)',
    border: '1px solid var(--border)',
  },
  outline: {
    background: 'transparent',
    color: 'var(--foreground)',
    border: '1px solid var(--border-solid, #262626)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--foreground)',
    border: '1px solid transparent',
  },
  destructive: {
    background: 'var(--destructive)',
    color: 'var(--destructive-foreground)',
    border: '1px solid transparent',
  },
  link: {
    background: 'transparent',
    color: 'var(--primary)',
    border: '1px solid transparent',
    textDecoration: 'underline',
    textUnderlineOffset: '4px',
  },
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", children, disabled, style, ...props }, ref) => {
    const vStyles = variantStyles[variant] ?? variantStyles.default;

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`ui-btn ui-btn-${variant} ui-btn-${size} ${className}`.trim()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          borderRadius: 'var(--radius, 6px)',
          fontWeight: 500,
          fontSize: size === 'sm' ? '0.8125rem' : size === 'lg' ? '0.9375rem' : '0.875rem',
          height: size === 'sm' ? '30px' : size === 'lg' ? '40px' : size === 'icon' ? '36px' : '36px',
          width: size === 'icon' ? '36px' : undefined,
          padding: size === 'icon' ? '0' : size === 'sm' ? '0 0.75rem' : size === 'lg' ? '0 1.25rem' : '0 0.875rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'background-color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
          fontFamily: 'var(--font-sans)',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          ...vStyles,
          ...style,
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
