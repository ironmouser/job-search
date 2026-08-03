import * as React from "react";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  children,
  className = "",
  style,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [selected, setSelected] = React.useState(value || defaultValue || "");

  const current = value !== undefined ? value : selected;
  const handleChange = (val: string) => {
    if (value === undefined) setSelected(val);
    onValueChange?.(val);
  };

  return (
    <TabsContext.Provider value={{ value: current, onValueChange: handleChange }}>
      <div className={`ui-tabs ${className}`} style={{ width: '100%', ...style }}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  variant = "line",
  className = "",
  style,
}: {
  children: React.ReactNode;
  variant?: "line" | "pills";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`ui-tabs-list ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: variant === "pills" ? '0.125rem' : '0',
        borderBottom: variant === "line" ? '1px solid var(--border)' : 'none',
        background: variant === "pills" ? 'var(--muted)' : 'transparent',
        padding: variant === "pills" ? '0.1875rem' : '0',
        borderRadius: variant === "pills" ? 'var(--radius-md, 0.5rem)' : '0',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className = "",
  style,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger must be used within Tabs");

  const isActive = ctx.value === value;

  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      className={`ui-tabs-trigger ${isActive ? 'active' : ''} ${className}`}
      style={{
        padding: '0.4375rem 0.875rem',
        fontSize: '0.875rem',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? 'var(--foreground)' : 'var(--muted-foreground)',
        background: isActive ? 'var(--card)' : 'transparent',
        border: 'none',
        borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
        marginBottom: '-1px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        borderRadius: '0',
        letterSpacing: '-0.01em',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className = "",
  style,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error("TabsContent must be used within Tabs");

  if (ctx.value !== value) return null;

  return (
    <div className={`ui-tabs-content ${className}`} style={{ paddingTop: '1.25rem', ...style }}>
      {children}
    </div>
  );
}
