"use client";

import { X, Clock, CheckCircle, XCircle } from "lucide-react";

export interface Invitation {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

interface InvitationsTableProps {
  invitations: Invitation[];
  onCancel: (invitationId: string) => void;
}

const STATUS_CONFIG = {
  PENDING: { label: "Pending", color: "#f59e0b", Icon: Clock },
  ACCEPTED: { label: "Accepted", color: "#10b981", Icon: CheckCircle },
  EXPIRED: { label: "Expired", color: "#6b7280", Icon: XCircle },
  CANCELLED: { label: "Cancelled", color: "#ef4444", Icon: XCircle },
};

export function InvitationsTable({ invitations, onCancel }: InvitationsTableProps) {
  if (invitations.length === 0) {
    return (
      <p style={{ color: "var(--text-secondary, #9ca3af)", textAlign: "center", padding: "2rem 0" }}>
        No invitations yet.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-glass)" }}>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Invited</th>
            <th style={thStyle}>Expires</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => {
            const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.PENDING;
            const { Icon } = cfg;
            return (
              <tr key={inv.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={tdStyle}>{inv.email}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: cfg.color + "22",
                      color: cfg.color,
                      border: `1px solid ${cfg.color}44`,
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    <Icon size={12} />
                    {cfg.label}
                  </span>
                </td>
                <td style={tdStyle}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                <td style={tdStyle}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                <td style={tdStyle}>
                  {inv.status === "PENDING" && (
                    <button
                      onClick={() => onCancel(inv.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#ef4444",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: "0.75rem",
                        padding: "2px 4px",
                      }}
                    >
                      <X size={14} /> Cancel
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
