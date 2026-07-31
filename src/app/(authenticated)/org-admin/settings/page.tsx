"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

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
    <div style={{ minHeight: "100vh", padding: "1.5rem" }}>
      <OrgHeader title="Organization Settings" subtitle="View and manage organization parameters and identifiers." />

      <div style={{ maxWidth: 520 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600, color: "#f9fafb" }}>
          Organization Configuration
        </h2>
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                background: "rgba(54,149,227,0.15)",
                color: "#3695e3",
                padding: 10,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Building2 size={24} />
            </div>
            <div>
              <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 2 }}>
                Organization Name
              </label>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "1.1rem", color: "#f9fafb" }}>
                {loading ? "Loading..." : org?.name ?? "—"}
              </p>
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 4 }}>
              Organization Type
            </label>
            <p style={{ margin: 0, fontSize: "0.95rem", color: "#e5e7eb", fontWeight: 500 }}>
              {org ? ORG_TYPE_LABELS[org.organizationType] ?? org.organizationType : "—"}
            </p>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            <label style={{ fontSize: "0.8rem", color: "#9ca3af", display: "block", marginBottom: 4 }}>
              Organization ID
            </label>
            <code
              style={{
                fontSize: "0.8rem",
                color: "#9ca3af",
                background: "rgba(0,0,0,0.3)",
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid rgba(255,255,255,0.08)",
                display: "inline-block",
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
