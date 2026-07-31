"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Send, AlertCircle, Check, Loader2, Mail } from "lucide-react";

import { OrgHeader } from "@/components/admin/OrgHeader";
import { InvitationsTable, Invitation } from "@/components/admin/InvitationsTable";
import { BulkEmailInput, EmailChip } from "@/components/admin/BulkEmailInput";

export default function OrgAdminInvitationsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const sessionUser = session?.user as any;
  const orgId = sessionUser?.organizationId as string | null;

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);

  const [chips, setChips] = useState<EmailChip[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null);

  const validChips = chips.filter((c) => c.isValid);
  const invalidChips = chips.filter((c) => !c.isValid);
  const hasInvalid = invalidChips.length > 0;
  const canSend = validChips.length > 0 && !hasInvalid && !inviting;

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
    if (!canSend || !orgId) return;

    setInviting(true);
    setInviteError(null);
    setInviteSuccessMsg(null);

    const emailList = validChips.map((c) => c.email);

    try {
      const res = await fetch(`/api/org/${orgId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emailList }),
      });

      const data = await res.json();

      if (res.ok) {
        const successCount = data.successCount ?? emailList.length;
        setInviteSuccessMsg(`Successfully sent ${successCount} invitation${successCount > 1 ? "s" : ""}!`);
        setChips([]);
        loadInvitations();

        if (data.results && Array.isArray(data.results)) {
          const failed = data.results.filter((r: any) => !r.success);
          if (failed.length > 0) {
            setInviteError(`Sent ${successCount} invite(s), but ${failed.length} failed: ${failed.map((f: any) => f.email + ' (' + f.error + ')').join(', ')}`);
          }
        }
      } else {
        setInviteError(data.error ?? "Failed to send invitations.");
      }
    } catch {
      setInviteError("Failed to send invitations.");
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
    <div style={{ minHeight: "100vh", padding: "1.5rem 0" }}>
      <OrgHeader title="Organization Invitations" subtitle="Invite team members in bulk and manage pending invitation links." />

      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 800 }}>
        <div className="glass-card" style={{ padding: "1.75rem" }}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1.5rem" }}>
            <Mail size={22} color="#3695e3" /> Send Bulk Invitations
          </h3>

          <form onSubmit={handleSendInvite} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <BulkEmailInput
              chips={chips}
              onChange={setChips}
              disabled={inviting}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="submit"
                disabled={!canSend}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: canSend ? "#3695e3" : "rgba(255,255,255,0.08)",
                  border: "none",
                  borderRadius: 8,
                  color: canSend ? "#ffffff" : "var(--text-secondary)",
                  padding: "10px 24px",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: canSend ? (inviting ? "wait" : "pointer") : "not-allowed",
                  transition: "all 0.15s ease",
                }}
              >
                {inviting ? (
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Send size={16} />
                )}
                {inviting
                  ? "Sending..."
                  : `Send ${validChips.length} Invite${validChips.length === 1 ? "" : "s"}`}
              </button>
            </div>
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
                marginTop: 16,
                color: "#ef4444",
                fontSize: "0.875rem",
              }}
            >
              <AlertCircle size={16} />
              {inviteError}
            </div>
          )}

          {inviteSuccessMsg && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: 8,
                padding: "10px 14px",
                marginTop: 16,
                color: "#10b981",
                fontSize: "0.875rem",
              }}
            >
              <Check size={16} />
              {inviteSuccessMsg}
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding: "1.75rem" }}>
          <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "1rem", fontWeight: 600 }}>
            Pending & Past Invitations
          </h4>
          {loadingInvitations ? (
            <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem" }}>Loading invitations...</p>
          ) : (
            <InvitationsTable
              invitations={invitations}
              onCancel={handleCancelInvitation}
            />
          )}
        </div>
      </div>
    </div>
  );
}
