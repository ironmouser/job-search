"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Plus, Mail, AlertCircle, Check, Loader2 } from "lucide-react";

import { OrgHeader } from "@/components/admin/OrgHeader";
import { InvitationsTable, Invitation } from "@/components/admin/InvitationsTable";

export default function OrgAdminInvitationsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const sessionUser = session?.user as any;
  const orgId = sessionUser?.organizationId as string | null;

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  useEffect(() => {
    if (
      session &&
      sessionUser?.role !== "ORGANIZATION_ADMIN" &&
      sessionUser?.role !== "SYSTEM_ADMIN"
    ) {
      router.replace("/dashboard");
    }
  }, [session, sessionUser?.role, router]);

  useEffect(() => {
    if (!orgId) return;
    loadInvitations();
  }, [orgId]);

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

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem" }}>
      <OrgHeader title="Organization Invitations" subtitle="Invite new team members and manage pending invitation links." />

      <div style={{ maxWidth: 640 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600, color: "#f9fafb" }}>
          Invite Member
        </h2>
        <form
          onSubmit={handleSendInvite}
          style={{ display: "flex", gap: 12, marginBottom: 16 }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <Mail
              size={16}
              color="#9ca3af"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "9px 12px 9px 36px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                color: "#f9fafb",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
          </div>
          <button
            type="submit"
            disabled={inviting || !inviteEmail}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#3695e3",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              padding: "9px 18px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: inviting ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {inviting ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={16} />}
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

        <h3 style={{ margin: "24px 0 12px", fontSize: "0.95rem", fontWeight: 600, color: "#9ca3af" }}>
          All Invitations
        </h3>
        {loadingInvitations ? (
          <p style={{ color: "#9ca3af", textAlign: "center" }}>Loading invitations...</p>
        ) : (
          <InvitationsTable
            invitations={invitations}
            onCancel={handleCancelInvitation}
          />
        )}
      </div>
    </div>
  );
}
