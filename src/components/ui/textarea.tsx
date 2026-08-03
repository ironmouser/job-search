import * as React from "react";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", style, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`ui-textarea ${className}`.trim()}
        style={{
          display: 'block',
          width: '100%',
          minHeight: '80px',
          padding: '0.625rem 0.75rem',
          fontSize: '0.875rem',
          lineHeight: '1.5',
          color: 'var(--foreground)',
          background: 'var(--background)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius, 6px)',
          outline: 'none',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          fontFamily: 'var(--font-sans)',
          resize: 'vertical',
          ...style,
        }}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
