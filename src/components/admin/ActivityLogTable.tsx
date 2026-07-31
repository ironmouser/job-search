"use client";

import { Activity } from "lucide-react";

export interface ActivityLogEntry {
  id: string;
  actorId: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  ORGANIZATION_CREATED: { label: "Organization created", color: "#10b981" },
  INVITE_SENT: { label: "Invitation sent", color: "#3695e3" },
  INVITE_ACCEPTED: { label: "Invitation accepted", color: "#10b981" },
  INVITE_CANCELLED: { label: "Invitation cancelled", color: "#6b7280" },
  USER_PROMOTED: { label: "User promoted to admin", color: "#8b5cf6" },
  USER_DEMOTED: { label: "User demoted to member", color: "#f59e0b" },
  USER_DISABLED: { label: "User disabled", color: "#ef4444" },
  USER_REMOVED: { label: "User removed", color: "#ef4444" },
  SEAT_PURCHASED: { label: "Seats purchased", color: "#10b981" },
};

interface ActivityLogTableProps {
  entries: ActivityLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

export function ActivityLogTable({
  entries,
  total,
  page,
  pageSize,
  onPageChange,
  loading = false,
}: ActivityLogTableProps) {
  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return <p style={{ color: "#9ca3af", textAlign: "center", padding: "2rem 0" }}>Loading activity...</p>;
  }

  if (entries.length === 0) {
    return <p style={{ color: "#9ca3af", textAlign: "center", padding: "2rem 0" }}>No activity yet.</p>;
  }

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-glass)" }}>
              <th style={thStyle}>Event</th>
              <th style={thStyle}>Target</th>
              <th style={thStyle}>Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const cfg = ACTION_LABELS[entry.action] ?? { label: entry.action, color: "#9ca3af" };
              return (
                <tr key={entry.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Activity size={14} color={cfg.color} />
                      <span style={{ color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
                    </div>
                  </td>
                  <td style={{ ...tdStyle, color: "#9ca3af", fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {entry.targetId ? entry.targetId.slice(0, 12) + "…" : "—"}
                  </td>
                  <td style={{ ...tdStyle, color: "#6b7280" }}>
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            style={paginationBtnStyle(page <= 1)}
          >
            Previous
          </button>
          <span style={{ color: "#9ca3af", fontSize: "0.875rem", lineHeight: "32px" }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            style={paginationBtnStyle(page >= totalPages)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "var(--text-secondary, #9ca3af)",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  color: "var(--text-primary, #f9fafb)",
  verticalAlign: "middle",
};

const paginationBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  color: disabled ? "#4b5563" : "#f9fafb",
  padding: "4px 14px",
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: "0.8rem",
});
