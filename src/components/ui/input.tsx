import * as React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", style, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`ui-input ${className}`.trim()}
        style={{
          display: 'block',
          width: '100%',
          height: '36px',
          padding: '0 0.75rem',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          color: 'var(--foreground)',
          background: 'var(--input, var(--card))',
          border: '1px solid var(--input-border, var(--border))',
          borderRadius: 'var(--radius, 6px)',
          outline: 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          fontFamily: 'var(--font-sans)',
          ...style,
        }}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
