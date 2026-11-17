import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "ui-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:pointer-events-none disabled:opacity-50 shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default: "ui-btn-default",
        primary: "ui-btn-default",
        secondary: "ui-btn-secondary",
        outline: "ui-btn-outline",
        ghost: "ui-btn-ghost",
        destructive: "ui-btn-destructive",
        link: "ui-btn-link",
      },
      size: {
        default: "ui-btn-size-default",
        sm: "ui-btn-size-sm",
        lg: "ui-btn-size-lg",
        icon: "ui-btn-size-icon",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    background: "var(--primary, #0070f3)",
    color: "var(--primary-foreground, #ffffff)",
    border: "1px solid transparent",
    boxShadow: "0 1px 2px rgba(0, 112, 243, 0.2)",
  },
  primary: {
    background: "var(--primary, #0070f3)",
    color: "var(--primary-foreground, #ffffff)",
    border: "1px solid transparent",
    boxShadow: "0 1px 2px rgba(0, 112, 243, 0.2)",
  },
  secondary: {
    background: "var(--secondary)",
    color: "var(--secondary-foreground)",
    border: "1px solid var(--border)",
  },
  outline: {
    background: "transparent",
    color: "var(--foreground)",
    border: "1px solid var(--border-solid, #262626)",
  },
  ghost: {
    background: "transparent",
    color: "var(--foreground)",
    border: "1px solid transparent",
  },
  destructive: {
    background: "var(--destructive, #ef4444)",
    color: "var(--destructive-foreground, #ffffff)",
    border: "1px solid transparent",
  },
  link: {
    background: "transparent",
    color: "var(--primary, #0070f3)",
    border: "1px solid transparent",
    textDecoration: "underline",
    textUnderlineOffset: "4px",
  },
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = "",
      variant = "default",
      size = "default",
      asChild = false,
      children,
      disabled,
      style,
      type = "button",
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const resolvedVariant = variant || "default";
    const resolvedSize = size || "default";
    const vStyles = variantStyles[resolvedVariant] ?? variantStyles.default;

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        disabled={disabled}
        className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          borderRadius: "var(--radius, 6px)",
          fontWeight: 500,
          fontSize:
            resolvedSize === "sm"
              ? "0.8125rem"
              : resolvedSize === "lg"
              ? "0.9375rem"
              : "0.875rem",
          minHeight:
            resolvedSize === "sm"
              ? "32px"
              : resolvedSize === "lg"
              ? "40px"
              : "36px",
          height:
            resolvedSize === "icon"
              ? "36px"
              : undefined,
          width: resolvedSize === "icon" ? "36px" : undefined,
          padding:
            resolvedSize === "icon"
              ? "0"
              : resolvedSize === "sm"
              ? "0.25rem 0.75rem"
              : resolvedSize === "lg"
              ? "0.5rem 1.25rem"
              : "0.375rem 0.875rem",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition:
            "background-color 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.15s ease",
          fontFamily: "var(--font-sans)",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
          flexShrink: 0,
          ...vStyles,
          ...style,
        }}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";
