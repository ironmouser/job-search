"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, UserPlus, Users, Trash2, Mail, Shield, AlertCircle, ArrowUpRight } from "lucide-react";

interface RecruiterTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenUpgradeModal: () => void;
}

export function RecruiterTeamModal({
  isOpen,
  onClose,
  onOpenUpgradeModal,
}: RecruiterTeamModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [teamData, setTeamData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("RECRUITER");

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recruiter/team");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load team");
      setTeamData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTeam();
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/recruiter/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          onClose();
          onOpenUpgradeModal();
          return;
        }
        throw new Error(data.error || "Failed to send invitation");
      }

      setInviteEmail("");
      loadTeam();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    try {
      const res = await fetch(`/api/recruiter/team?invitationId=${invitationId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadTeam();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    try {
      const res = await fetch(`/api/recruiter/team?memberId=${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadTeam();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const seats = teamData?.entitlements?.seats;
  const isOwnerOrAdmin =
    teamData?.currentRecruiterRole === "OWNER" || teamData?.currentRecruiterRole === "ADMIN";

  const modalContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        padding: "1rem",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "680px",
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          color: "var(--card-foreground)",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "1.75rem",
          boxSizing: "border-box",
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1.25rem",
            right: "1.25rem",
            background: "var(--secondary)",
            border: "1px solid var(--border)",
            borderRadius: "50%",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--muted-foreground)",
          }}
          title="Close modal"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.25rem" }}>
          <Users size={22} color="#3695e3" />
          <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
            Team Seats & Collaboration
          </h2>
        </div>
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.88rem", margin: "0 0 1.25rem 0" }}>
          Manage your organization&apos;s recruiter seats and team invitations.
        </p>

        {/* Seat Capacity Meter */}
        {seats && (
          <div
            style={{
              padding: "0.85rem 1.15rem",
              backgroundColor: "var(--secondary)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              marginBottom: "1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.82rem", color: "var(--muted-foreground)", marginBottom: "3px" }}>Seat Allocation</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>
                {seats.activeRecruiters + seats.pendingInvites} of {seats.totalSeats} Seats Claimed
              </div>
            </div>

            {!seats.canInviteMore && (
              <button
                onClick={() => {
                  onClose();
                  onOpenUpgradeModal();
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  background: "rgba(54, 149, 227, 0.15)",
                  border: "1px solid rgba(54, 149, 227, 0.3)",
                  color: "#3695e3",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>Upgrade Seats</span>
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: "0.65rem 0.9rem",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "0.85rem",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Invite Teammate Form (Owners & Admins only) */}
        {isOwnerOrAdmin && (
          <form
            onSubmit={handleSendInvite}
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            <input
              type="email"
              placeholder="colleague@agency.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              style={{
                flex: 1,
                minWidth: "220px",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                backgroundColor: "var(--input)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                fontSize: "0.88rem",
              }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={{
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                backgroundColor: "var(--input)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                fontSize: "0.88rem",
              }}
            >
              <option value="RECRUITER">Recruiter</option>
              <option value="ADMIN">Admin</option>
              <option value="RESEARCHER">Researcher</option>
            </select>
            <button
              type="submit"
              disabled={submitting || (seats && !seats.canInviteMore)}
              style={{
                padding: "0.6rem 1.1rem",
                borderRadius: "8px",
                backgroundColor: "#3695e3",
                border: "none",
                color: "#ffffff",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: submitting || (seats && !seats.canInviteMore) ? "not-allowed" : "pointer",
                opacity: submitting || (seats && !seats.canInviteMore) ? 0.6 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <UserPlus size={15} />
              <span>{submitting ? "Inviting..." : "Send Invite"}</span>
            </button>
          </form>
        )}

        {/* Member List */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--foreground)", margin: "0 0 0.75rem 0" }}>
            Active Team Members ({teamData?.members?.length || 0})
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {teamData?.members?.map((m: any) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  backgroundColor: "var(--secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--foreground)" }}>
                    {m.name} {m.title && <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>&bull; {m.title}</span>}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>{m.businessEmail}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: m.role === "OWNER" ? "rgba(245, 158, 11, 0.15)" : "rgba(54, 149, 227, 0.15)",
                      color: m.role === "OWNER" ? "#f59e0b" : "#3695e3",
                    }}
                  >
                    {m.role}
                  </span>

                  {isOwnerOrAdmin && m.role !== "OWNER" && (
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        padding: "4px",
                      }}
                      title="Remove member"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Invites */}
        {teamData?.pendingInvitations?.length > 0 && (
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: "#ffffff", margin: "0 0 0.75rem 0" }}>
              Pending Invitations ({teamData.pendingInvitations.length})
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {teamData.pendingInvitations.map((inv: any) => (
                <div
                  key={inv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    border: "1px dashed rgba(255, 255, 255, 0.12)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Mail size={15} color="#94a3b8" />
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "#ffffff" }}>{inv.email}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Role: {inv.role}</div>
                    </div>
                  </div>

                  {isOwnerOrAdmin && (
                    <button
                      onClick={() => handleRevokeInvite(inv.id)}
                      style={{
                        fontSize: "0.78rem",
                        color: "#ef4444",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default RecruiterTeamModal;
