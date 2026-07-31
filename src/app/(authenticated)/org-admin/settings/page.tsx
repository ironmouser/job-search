"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, Settings } from "lucide-react";

import { OrgHeader } from "@/components/admin/OrgHeader";

const ORG_TYPE_LABELS: Record<string, string> = {
  BUSINESS: "Business",
  CAREER_CENTER: "Career Center",
  NONPROFIT: "Nonprofit",
  STAFFING_AGENCY: "Staffing Agency",
  EDUCATIONAL_INSTITUTION: "Educational Institution",
};

interface Organization {
  id: string;
  name: string;
  organizationType: string;
}

export default function OrgAdminSettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const sessionUser = session?.user as any;
  const orgId = sessionUser?.organizationId as string | null;

  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

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
    setLoading(true);
    fetch(`/api/org/${orgId}/seats`)
      .then((r) => r.json())
      .then((data) => {
        setOrg({
          id: orgId,
          name: data.name ?? sessionUser?.name ?? "My Organization",
          organizationType: data.organizationType ?? "BUSINESS",
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem 0" }}>
      <OrgHeader title="Organization Settings" subtitle="View and manage organization parameters and identifiers." />

      <div className="glass-card" style={{ padding: "1.75rem", maxWidth: 640 }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1.75rem" }}>
          <Settings size={22} color="#3695e3" /> Organization Configuration
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "rgba(54,149,227,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Building2 size={24} color="#3695e3" />
            </div>
            <div>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                Organization Name
              </label>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "1.2rem", color: "var(--text-primary)" }}>
                {loading ? "Loading..." : org?.name ?? "—"}
              </p>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-glass)", paddingTop: 16 }}>
            <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "0.5rem", fontWeight: 600 }}>
              Organization Type
            </h4>
            <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--text-primary)", fontWeight: 500 }}>
              {org ? ORG_TYPE_LABELS[org.organizationType] ?? org.organizationType : "—"}
            </p>
          </div>

          <div style={{ borderTop: "1px solid var(--border-glass)", paddingTop: 16 }}>
            <h4 style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "0.5rem", fontWeight: 600 }}>
              Organization ID
            </h4>
            <code
              style={{
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                background: "rgba(0, 0, 0, 0.07)",
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-glass)",
                display: "inline-block",
                fontFamily: "monospace",
              }}
            >
              {org?.id ?? "—"}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
