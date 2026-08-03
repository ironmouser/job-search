import * as React from "react";

export function PageHeader({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`ui-page-header ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.875rem',
        marginBottom: '1.75rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid var(--border)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PageHeaderHeading({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <h1
      className={`ui-page-header-heading ${className}`}
      style={{
        fontSize: '1.375rem',
        fontWeight: 700,
        letterSpacing: '-0.03em',
        color: 'var(--foreground)',
        margin: 0,
        lineHeight: 1.2,
        fontFamily: 'var(--font-display)',
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function PageHeaderDescription({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <p
      className={`ui-page-header-description ${className}`}
      style={{
        fontSize: '0.875rem',
        color: 'var(--muted-foreground)',
        marginTop: '0.2rem',
        margin: 0,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

export function PageHeaderActions({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`ui-page-header-actions ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
