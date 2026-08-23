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
      role="tablist"
      className={`ui-tabs-list ${variant === "pills" ? "app-segmented-tabs" : ""} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: variant === "pills" ? '4px' : '0',
        borderBottom: variant === "line" ? '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))' : 'none',
        background: variant === "pills" ? 'var(--bg-secondary, rgba(255, 255, 255, 0.05))' : 'transparent',
        padding: variant === "pills" ? '4px' : '0',
        borderRadius: variant === "pills" ? '10px' : '0',
        border: variant === "pills" ? '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))' : 'none',
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
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.onValueChange(value)}
      className={`ui-tabs-trigger app-tab-btn ${isActive ? 'active' : ''} ${className}`}
      style={{
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
