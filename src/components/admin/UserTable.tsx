"use client";

import { Trash2, ArrowUpDown } from "lucide-react";
import { useState } from "react";

export interface OrgMember {
  id: string;
  name: string | null;
  email: string | null;
  role: "USER" | "ORGANIZATION_ADMIN" | "SYSTEM_ADMIN";
  subscriptionType: string;
  isDisabled: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  orgAccessExpiresAt: string | null;
}

interface UserTableProps {
  users: OrgMember[];
  currentUserId: string;
  onRoleChange: (userId: string, role: "USER" | "ORGANIZATION_ADMIN") => Promise<void>;
  onRemove: (user: OrgMember) => void;
  onDisable?: (userId: string) => void;
  showRemove?: boolean;
}

export function UserTable({
  users,
  currentUserId,
  onRoleChange,
  onRemove,
  showRemove = true,
}: UserTableProps) {
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, role: "USER" | "ORGANIZATION_ADMIN") => {
    setSavingId(userId);
    try {
      await onRoleChange(userId, role);
    } finally {
      setSavingId(null);
    }
  };

  const badge = (user: OrgMember) => {
    if (user.isDisabled) return { label: "Disabled", color: "#6b7280" };
    if (user.role === "ORGANIZATION_ADMIN") return { label: "Org Admin", color: "#8b5cf6" };
    if (user.role === "SYSTEM_ADMIN") return { label: "System Admin", color: "#ef4444" };
    return { label: "Member", color: "#3695e3" };
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-glass)" }}>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Role</th>
            <th style={thStyle}>Joined</th>
            <th style={thStyle}>Access Expires</th>
            {showRemove && <th style={thStyle}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const b = badge(user);
            const isSelf = user.id === currentUserId;
            return (
              <tr
                key={user.id}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  opacity: user.isDisabled ? 0.5 : 1,
                }}
              >
                <td style={tdStyle}>{user.name ?? "—"}</td>
                <td style={tdStyle}>{user.email ?? "—"}</td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        background: b.color + "22",
                        color: b.color,
                        border: `1px solid ${b.color}44`,
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      {b.label}
                    </span>
                    {!isSelf && user.role !== "SYSTEM_ADMIN" && !user.isDisabled && (
                      <select
                        value={user.role}
                        disabled={savingId === user.id}
                        onChange={(e) =>
                          handleRoleChange(
                            user.id,
                            e.target.value as "USER" | "ORGANIZATION_ADMIN"
                          )
                        }
                        style={selectStyle}
                      >
                        <option value="USER">Member</option>
                        <option value="ORGANIZATION_ADMIN">Org Admin</option>
                      </select>
                    )}
                  </div>
                </td>
                <td style={tdStyle}>
                  {user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : "—"}
                </td>
                <td style={tdStyle}>
                  {user.orgAccessExpiresAt
                    ? new Date(user.orgAccessExpiresAt).toLocaleDateString()
                    : "—"}
                </td>
                {showRemove && (
                  <td style={tdStyle}>
                    <button
                      disabled={isSelf || user.role === "SYSTEM_ADMIN"}
                      onClick={() => onRemove(user)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor:
                          isSelf || user.role === "SYSTEM_ADMIN"
                            ? "not-allowed"
                            : "pointer",
                        opacity: isSelf || user.role === "SYSTEM_ADMIN" ? 0.3 : 1,
                        color: "#ef4444",
                        padding: 4,
                      }}
                      title="Remove member"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
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

const selectStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  color: "inherit",
  fontSize: "0.75rem",
  padding: "2px 6px",
  cursor: "pointer",
};
