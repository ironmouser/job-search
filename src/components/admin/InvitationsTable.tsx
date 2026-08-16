"use client";

import { X, Clock, CheckCircle, XCircle, RotateCcw, Loader2 } from "lucide-react";

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
  onResend?: (invitationId: string) => void;
  resendingId?: string | null;
}

const STATUS_CONFIG = {
  PENDING: { label: "Pending", color: "#f59e0b", Icon: Clock },
  ACCEPTED: { label: "Accepted", color: "#10b981", Icon: CheckCircle },
  EXPIRED: { label: "Unclaimed (Seat Restored)", color: "#8b5cf6", Icon: RotateCcw },
  CANCELLED: { label: "Cancelled (Seat Restored)", color: "#64748b", Icon: XCircle },
};

export function InvitationsTable({
  invitations,
  onCancel,
  onResend,
  resendingId,
}: InvitationsTableProps) {
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
            <th style={thStyle}>Recipient Email</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Date Invited</th>
            <th style={thStyle}>Date Accepted / Expiry</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => {
            const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.PENDING;
            const { Icon } = cfg;
            const isRowResending = resendingId === inv.id;

            return (
              <tr key={inv.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>{inv.email}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: cfg.color + "1a",
                      color: cfg.color,
                      border: `1px solid ${cfg.color}33`,
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Icon size={12} />
                    {cfg.label}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                  {new Date(inv.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td style={tdStyle}>
                  {inv.status === "ACCEPTED" ? (
                    <span style={{ color: "#10b981", fontSize: "0.825rem", fontWeight: 500 }}>
                      Accepted {new Date(inv.acceptedAt || inv.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  ) : inv.status === "PENDING" ? (
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.825rem" }}>
                      Expires {new Date(inv.expiresAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.825rem" }}>
                      Lapsed {new Date(inv.expiresAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                    {/* Resend button for Pending, Expired, and Cancelled */}
                    {onResend && inv.status !== "ACCEPTED" && (
                      <button
                        type="button"
                        onClick={() => onResend(inv.id)}
                        disabled={isRowResending}
                        style={{
                          background: "rgba(54, 149, 227, 0.1)",
                          border: "1px solid rgba(54, 149, 227, 0.25)",
                          borderRadius: 6,
                          cursor: isRowResending ? "wait" : "pointer",
                          color: "#3695e3",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "3px 8px",
                          transition: "all 0.15s ease",
                        }}
                        title={
                          inv.status === "PENDING"
                            ? "Resend email reminder to recipient"
                            : "Re-activate invite and send to recipient"
                        }
                      >
                        {isRowResending ? (
                          <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <RotateCcw size={12} />
                        )}
                        Resend
                      </button>
                    )}

                    {/* Cancel button for Pending invitations */}
                    {inv.status === "PENDING" && (
                      <button
                        type="button"
                        onClick={() => onCancel(inv.id)}
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          borderRadius: 6,
                          cursor: "pointer",
                          color: "#ef4444",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "3px 8px",
                          transition: "all 0.15s ease",
                        }}
                        title="Cancel invite and restore seat to balance"
                      >
                        <X size={12} /> Cancel
                      </button>
                    )}
                  </div>
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

