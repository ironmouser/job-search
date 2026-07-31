"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Loader2, X } from "lucide-react";

import { OrgHeader } from "@/components/admin/OrgHeader";
import { UserTable, OrgMember } from "@/components/admin/UserTable";

export default function OrgAdminMembersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const sessionUser = session?.user as any;
  const orgId = sessionUser?.organizationId as string | null;

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // Remove user modal state
  const [userToRemove, setUserToRemove] = useState<OrgMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    loadMembers();
  }, [orgId]);

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
    } catch (e) {
      console.error(e);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem" }}>
      <OrgHeader title="Organization Members" subtitle="View and manage team member access and administrative roles." />

      <div>
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "#f9fafb" }}>Members</h2>
          <Link
            href="/org-admin/invitations"
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
              textDecoration: "none",
            }}
          >
            <Plus size={14} /> Invite Member
          </Link>
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

      {/* Remove Member Modal */}
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
              background: "rgba(0, 0, 0, 0.6)",
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
