"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Users,
  Mail,
  LayoutDashboard,
  Settings,
  CreditCard,
  Activity,
  Cpu,
  X,
  Plus,
  AlertCircle,
  Check,
  Loader2,
  Building2,
} from "lucide-react";

import { UserTable, OrgMember } from "@/components/admin/UserTable";
import { InvitationsTable, Invitation } from "@/components/admin/InvitationsTable";
import { SeatUsageCard } from "@/components/admin/SeatUsageCard";
import { ActivityLogTable, ActivityLogEntry } from "@/components/admin/ActivityLogTable";

type Tab = "dashboard" | "users" | "invitations" | "seats" | "billing" | "settings" | "activity";

interface Organization {
  id: string;
  name: string;
  organizationType: string;
  seatCount: number;
  consumedSeats: number;
  remainingSeats: number;
  activeUnexpiredSeats: number;
  stats?: {
    purchased30Days: number;
    purchased6Months: number;
    purchasedThisYear: number;
    purchased365Days: number;
  };
}

// ─── Tab Definitions ──────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "users", label: "Members", Icon: Users },
  { id: "invitations", label: "Invitations", Icon: Mail },
  { id: "seats", label: "Pass Management", Icon: Cpu },
  { id: "settings", label: "Org Settings", Icon: Settings },
  { id: "activity", label: "Activity Log", Icon: Activity },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORG_TYPE_LABELS: Record<string, string> = {
  BUSINESS: "Business",
  CAREER_CENTER: "Career Center",
  NONPROFIT: "Nonprofit",
  STAFFING_AGENCY: "Staffing Agency",
  EDUCATIONAL_INSTITUTION: "Educational Institution",
};

export default function OrgAdminDashboard() {
  const { data: session } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [mounted, setMounted] = useState(false);

  // Organization
  const [org, setOrg] = useState<Organization | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);

  // Members
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Invitations
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Activity
  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Remove user modal
  const [userToRemove, setUserToRemove] = useState<OrgMember | null>(null);
  const [removing, setRemoving] = useState(false);

  const sessionUser = session?.user as any;
  const orgId = sessionUser?.organizationId as string | null;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auth guard — client-side backup
  useEffect(() => {
    if (
      session &&
      sessionUser?.role !== "ORGANIZATION_ADMIN" &&
      sessionUser?.role !== "SYSTEM_ADMIN"
    ) {
      router.replace("/dashboard");
    }
  }, [session, sessionUser?.role, router]);

  // Load org
  useEffect(() => {
    if (!orgId) return;
    setLoadingOrg(true);
    fetch(`/api/org/${orgId}/seats`)
      .then((r) => r.json())
      .then((seats) => {
        // Merge with org info from members endpoint headers or a dedicated GET /api/org/[orgId]
        setOrg((prev) =>
          prev
            ? { ...prev, ...seats }
            : {
                id: orgId,
                name: sessionUser?.name ?? "My Organization",
                organizationType: "BUSINESS",
                ...seats,
              }
        );
      })
      .catch(console.error)
      .finally(() => setLoadingOrg(false));
  }, [orgId]);

  // Load data when tab changes
  useEffect(() => {
    if (!orgId) return;
    if (activeTab === "users") loadMembers();
    if (activeTab === "invitations") loadInvitations();
    if (activeTab === "seats") loadSeats();
    if (activeTab === "activity") loadActivity(1);
  }, [activeTab, orgId]);

  const loadMembers = async () => {
    if (!orgId) return;
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/org/${orgId}/users`);
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMembers(false);
    }
  };

  const loadInvitations = async () => {
    if (!orgId) return;
    setLoadingInvitations(true);
    try {
      const res = await fetch(`/api/org/${orgId}/invitations`);
      const data = await res.json();
      setInvitations(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const loadSeats = async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/org/${orgId}/seats`);
      const data = await res.json();
      setOrg((prev) => (prev ? { ...prev, ...data } : null));
    } catch (e) {
      console.error(e);
    }
  };

  const loadActivity = async (page: number) => {
    if (!orgId) return;
    setLoadingActivity(true);
    try {
      const res = await fetch(`/api/org/${orgId}/activity?page=${page}&pageSize=50`);
      const data = await res.json();
      setActivityEntries(data.logs ?? []);
      setActivityTotal(data.total ?? 0);
      setActivityPage(data.page ?? 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingActivity(false);
    }
  };

  const handleRoleChange = async (userId: string, role: "USER" | "ORGANIZATION_ADMIN") => {
    if (!orgId) return;
    await fetch(`/api/org/${orgId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    loadMembers();
  };

  const handleRemoveMember = async () => {
    if (!userToRemove || !orgId) return;
    setRemoving(true);
    try {
      await fetch(`/api/org/${orgId}/users`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userToRemove.id, action: "remove" }),
      });
      setUserToRemove(null);
      loadMembers();
      loadSeats();
    } catch (e) {
      console.error(e);
    } finally {
      setRemoving(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !orgId) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      const res = await fetch(`/api/org/${orgId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      if (res.ok) {
        setInviteSuccess(true);
        setInviteEmail("");
        loadInvitations();
        loadSeats();
      } else {
        const data = await res.json();
        setInviteError(data.error ?? "Failed to send invitation");
      }
    } catch {
      setInviteError("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!orgId) return;
    await fetch(`/api/org/${orgId}/invitations`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    loadInvitations();
  };

  const handlePurchaseMoreSeats = async () => {
    if (!orgId) return;
    const priceId = process.env.NEXT_PUBLIC_STRIPE_ORG_PRICE_ID;
    if (!priceId) {
      alert("Seat purchase is not configured yet. Contact support.");
      return;
    }
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId, organizationId: orgId, quantity: 10 }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  };

  if (!orgId && !loadingOrg) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <Building2 size={48} color="#9ca3af" style={{ marginBottom: 16 }} />
        <h2 style={{ color: "#f9fafb" }}>No Organization Found</h2>
        <p style={{ color: "#9ca3af" }}>You are not currently a member of any organization.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <Building2 size={22} color="#3695e3" />
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            {org?.name ?? "Organization Admin"}
          </h1>
          {org?.organizationType && (
            <span
              style={{
                background: "rgba(54,149,227,0.15)",
                color: "#3695e3",
                border: "1px solid rgba(54,149,227,0.3)",
                padding: "2px 10px",
                borderRadius: 4,
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {ORG_TYPE_LABELS[org.organizationType] ?? org.organizationType}
            </span>
          )}
        </div>
        <p style={{ color: "#9ca3af", margin: 0, fontSize: "0.875rem" }}>
          Manage your organization's members, seats, and billing.
        </p>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: "2rem",
          overflowX: "auto",
          paddingBottom: 4,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: "8px 8px 0 0",
              border: "none",
              cursor: "pointer",
              fontWeight: activeTab === id ? 600 : 400,
              fontSize: "0.875rem",
              background: activeTab === id ? "rgba(54,149,227,0.15)" : "transparent",
              color: activeTab === id ? "#3695e3" : "#9ca3af",
              borderBottom: activeTab === id ? "2px solid #3695e3" : "2px solid transparent",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {/* ── Dashboard ────────────────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {/* Stats cards */}
            {[
              {
                label: "Passes Consumed",
                value: org?.consumedSeats ?? "—",
                color: "#3695e3",
              },
              {
                label: "Total Passes",
                value: org?.seatCount ?? "—",
                color: "#8b5cf6",
              },
              {
                label: "Available Passes",
                value: org?.remainingSeats ?? "—",
                color: "#10b981",
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#9ca3af", marginBottom: 8 }}>{label}</p>
                <p style={{ margin: 0, fontSize: "2rem", fontWeight: 700, color }}>{value}</p>
              </div>
            ))}

            {/* Seat usage */}
            <div style={{ gridColumn: "1 / -1" }}>
              <SeatUsageCard
                seatCount={org?.seatCount ?? 0}
                consumedSeats={org?.consumedSeats ?? 0}
                remainingSeats={org?.remainingSeats ?? 0}
                activeUnexpiredSeats={org?.activeUnexpiredSeats ?? 0}
                stats={org?.stats}
                onPurchaseMore={handlePurchaseMoreSeats}
                loading={loadingOrg}
              />
            </div>
          </div>
        )}

        {/* ── Members ──────────────────────────────────────────── */}
        {activeTab === "users" && (
          <div>
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Members</h2>
              <button
                onClick={() => setActiveTab("invitations")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(54,149,227,0.15)",
                  border: "1px solid rgba(54,149,227,0.3)",
                  borderRadius: 8,
                  color: "#3695e3",
                  padding: "6px 14px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus size={14} /> Invite Member
              </button>
            </div>
            {loadingMembers ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>
                <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : (
              <UserTable
                users={members}
                currentUserId={sessionUser?.id ?? ""}
                onRoleChange={handleRoleChange}
                onRemove={(u) => setUserToRemove(u)}
              />
            )}
          </div>
        )}

        {/* ── Invitations ───────────────────────────────────────── */}
        {activeTab === "invitations" && (
          <div>
            <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600 }}>Invite a New Member</h2>

            <form
              onSubmit={handleSendInvite}
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 24,
                flexWrap: "wrap",
              }}
            >
              <input
                type="email"
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                style={{
                  flex: 1,
                  minWidth: 200,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#f9fafb",
                  fontSize: "0.875rem",
                }}
              />
              <button
                type="submit"
                disabled={inviting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#3695e3",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  padding: "8px 18px",
                  fontWeight: 600,
                  cursor: inviting ? "wait" : "pointer",
                  fontSize: "0.875rem",
                }}
              >
                {inviting ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Mail size={16} />}
                Send Invite
              </button>
            </form>

            {inviteError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 16,
                  color: "#ef4444",
                  fontSize: "0.875rem",
                }}
              >
                <AlertCircle size={16} />
                {inviteError}
              </div>
            )}

            {inviteSuccess && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(16,185,129,0.1)",
                  border: "1px solid rgba(16,185,129,0.2)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 16,
                  color: "#10b981",
                  fontSize: "0.875rem",
                }}
              >
                <Check size={16} />
                Invitation sent successfully!
              </div>
            )}

            <h3 style={{ margin: "0 0 12px", fontSize: "0.95rem", fontWeight: 600, color: "#9ca3af" }}>
              All Invitations
            </h3>
            {loadingInvitations ? (
              <p style={{ color: "#9ca3af", textAlign: "center" }}>Loading...</p>
            ) : (
              <InvitationsTable
                invitations={invitations}
                onCancel={handleCancelInvitation}
              />
            )}
          </div>
        )}

        {/* ── Seat Management ───────────────────────────────────── */}
        {activeTab === "seats" && (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600 }}>Pass Management</h2>
            <SeatUsageCard
              seatCount={org?.seatCount ?? 0}
              consumedSeats={org?.consumedSeats ?? 0}
              remainingSeats={org?.remainingSeats ?? 0}
              activeUnexpiredSeats={org?.activeUnexpiredSeats ?? 0}
              stats={org?.stats}
              onPurchaseMore={handlePurchaseMoreSeats}
            />
          </div>
        )}



        {/* ── Org Settings ─────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div style={{ maxWidth: 480 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600 }}>
              Organization Settings
            </h2>
            <div
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "1.5rem",
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div>
                <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 4 }}>
                  Organization Name
                </label>
                <p style={{ margin: 0, fontWeight: 600 }}>{org?.name ?? "—"}</p>
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 4 }}>
                  Organization Type
                </label>
                <p style={{ margin: 0 }}>
                  {org ? ORG_TYPE_LABELS[org.organizationType] ?? org.organizationType : "—"}
                </p>
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 4 }}>
                  Organization ID
                </label>
                <code style={{ fontSize: "0.75rem", color: "#6b7280" }}>{org?.id ?? "—"}</code>
              </div>
            </div>
          </div>
        )}

        {/* ── Activity Log ─────────────────────────────────────── */}
        {activeTab === "activity" && (
          <div>
            <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600 }}>Activity Log</h2>
            <ActivityLogTable
              entries={activityEntries}
              total={activityTotal}
              page={activityPage}
              pageSize={50}
              onPageChange={(p) => loadActivity(p)}
              loading={loadingActivity}
            />
          </div>
        )}
      </div>

      {/* ── Remove Member Modal ───────────────────────────────── */}
      {mounted &&
        userToRemove &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              background: "rgba(0, 0, 0, 0.5)",
              padding: "1rem",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !removing) setUserToRemove(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 16,
                padding: "1.75rem",
                width: "100%",
                maxWidth: 420,
                color: "#0f172a",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600, color: "#0f172a" }}>Remove Member</h3>
                <button
                  onClick={() => setUserToRemove(null)}
                  disabled={removing}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: "4px", borderRadius: "6px" }}
                >
                  <X size={18} />
                </button>
              </div>
              <p style={{ color: "#475569", margin: 0, fontSize: "0.88rem", lineHeight: 1.5 }}>
                Are you sure you want to remove{" "}
                <strong style={{ color: "#0f172a" }}>
                  {userToRemove.name ?? userToRemove.email}
                </strong>{" "}
                from the organization? This will free their seat immediately.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.25rem" }}>
                <button
                  onClick={() => setUserToRemove(null)}
                  disabled={removing}
                  style={{
                    backgroundColor: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    color: "#334155",
                    padding: "0.6rem 1.1rem",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveMember}
                  disabled={removing}
                  style={{
                    background: "#dc2626",
                    border: "none",
                    borderRadius: 8,
                    color: "#ffffff",
                    padding: "0.6rem 1.25rem",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: removing ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {removing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : null}
                  Remove Member
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
