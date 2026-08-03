import * as React from "react";

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className = "", style, ...props }, ref) => (
  <div style={{
    width: '100%',
    overflowX: 'auto',
    borderRadius: 'var(--radius-lg, 0.625rem)',
    border: '1px solid var(--border)',
    background: 'var(--card)',
  }}>
    <table
      ref={ref}
      className={`ui-table ${className}`.trim()}
      style={{
        width: '100%',
        captionSide: 'bottom',
        fontSize: '0.875rem',
        borderCollapse: 'collapse',
        textAlign: 'left',
        background: 'transparent',
        ...style,
      }}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = "", style, ...props }, ref) => (
  <thead
    ref={ref}
    className={`ui-table-header ${className}`.trim()}
    style={{
      background: 'var(--card-header-bg)',
      borderBottom: '1px solid var(--border)',
      ...style,
    }}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className = "", style, ...props }, ref) => (
  <tbody
    ref={ref}
    className={`ui-table-body ${className}`.trim()}
    style={{ ...style }}
    {...props}
  />
));
TableBody.displayName = "TableBody";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className = "", style, ...props }, ref) => (
  <tr
    ref={ref}
    className={`ui-table-row ${className}`.trim()}
    style={{
      borderBottom: '1px solid var(--border)',
      transition: 'background-color 0.1s ease',
      ...style,
    }}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className = "", style, ...props }, ref) => (
  <th
    ref={ref}
    className={`ui-table-head ${className}`.trim()}
    style={{
      height: '38px',
      padding: '0 1rem',
      fontSize: '0.75rem',
      fontWeight: 600,
      letterSpacing: '0.01em',
      color: 'var(--muted-foreground)',
      verticalAlign: 'middle',
      whiteSpace: 'nowrap',
      ...style,
    }}
    {...props}
  />
));
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className = "", style, ...props }, ref) => (
  <td
    ref={ref}
    className={`ui-table-cell ${className}`.trim()}
    style={{
      padding: '0.8125rem 1rem',
      verticalAlign: 'middle',
      color: 'var(--foreground)',
      ...style,
    }}
    {...props}
  />
));
TableCell.displayName = "TableCell";
