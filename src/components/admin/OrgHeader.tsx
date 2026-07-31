"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Building2 } from "lucide-react";

const ORG_TYPE_LABELS: Record<string, string> = {
  BUSINESS: "Business",
  CAREER_CENTER: "Career Center",
  NONPROFIT: "Nonprofit",
  STAFFING_AGENCY: "Staffing Agency",
  EDUCATIONAL_INSTITUTION: "Educational Institution",
};

interface OrgHeaderProps {
  title?: string;
  subtitle?: string;
}

export function OrgHeader({ title, subtitle }: OrgHeaderProps) {
  const { data: session } = useSession();
  const sessionUser = session?.user as any;
  const orgId = sessionUser?.organizationId as string | null;

  const [orgName, setOrgName] = useState<string>(sessionUser?.name ?? "Organization Admin");
  const [orgType, setOrgType] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/org/${orgId}/seats`)
      .then((r) => r.json())
      .then((data) => {
        if (data.name) setOrgName(data.name);
        if (data.organizationType) setOrgType(data.organizationType);
      })
      .catch(console.error);
  }, [orgId]);

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Building2 size={24} color="#3695e3" />
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, color: "#f9fafb" }}>
          {title || orgName}
        </h1>
        {orgType && (
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
            {ORG_TYPE_LABELS[orgType] ?? orgType}
          </span>
        )}
      </div>
      <p style={{ color: "#9ca3af", margin: 0, fontSize: "0.875rem" }}>
        {subtitle || "Manage your organization's members, seats, and billing."}
      </p>
    </div>
  );
}
