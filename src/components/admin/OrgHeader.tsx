"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  LayoutDashboard,
  Users,
  Mail,
  Cpu,
  Settings,
  Activity,
} from "lucide-react";

const ORG_TYPE_LABELS: Record<string, string> = {
  BUSINESS: "Business",
  CAREER_CENTER: "Career Center",
  NONPROFIT: "Nonprofit",
  STAFFING_AGENCY: "Staffing Agency",
  EDUCATIONAL_INSTITUTION: "Educational Institution",
};

export const ORG_ADMIN_NAV_ITEMS = [
  {
    title: "Dashboard",
    href: "/org-admin",
    Icon: LayoutDashboard,
    color: "#3695e3",
  },
  {
    title: "Members",
    href: "/org-admin/members",
    Icon: Users,
    color: "#3695e3",
  },
  {
    title: "Invitations",
    href: "/org-admin/invitations",
    Icon: Mail,
    color: "#10b981",
  },
  {
    title: "Passes",
    href: "/org-admin/seats",
    Icon: Cpu,
    color: "#8b5cf6",
  },
  {
    title: "Settings",
    href: "/org-admin/settings",
    Icon: Settings,
    color: "#f59e0b",
  },
  {
    title: "Activity Log",
    href: "/org-admin/activity",
    Icon: Activity,
    color: "#ec4899",
  },
];

interface OrgHeaderProps {
  title?: string;
  subtitle?: string;
  hideNav?: boolean;
}

export function OrgHeader({ title, subtitle, hideNav = false }: OrgHeaderProps) {
  const pathname = usePathname();
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

  const isItemActive = (href: string) => {
    if (href === "/org-admin") {
      return pathname === "/org-admin";
    }
    return pathname?.startsWith(href);
  };

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <Building2 size={26} color="#3695e3" />
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
          {title || orgName}
        </h1>
        {orgType && (
          <span
            style={{
              background: "rgba(54,149,227,0.15)",
              color: "#3695e3",
              border: "1px solid rgba(54,149,227,0.3)",
              padding: "3px 10px",
              borderRadius: 6,
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            {ORG_TYPE_LABELS[orgType] ?? orgType}
          </span>
        )}
      </div>
      <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 1rem 0", fontSize: "0.9rem" }}>
        {subtitle || "Manage your organization's members, seats, and billing."}
      </p>

      {!hideNav && (
        <div
          className="org-admin-header-nav"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            paddingTop: "0.75rem",
            borderTop: "1px solid var(--border-glass, rgba(255,255,255,0.1))",
          }}
        >
          {ORG_ADMIN_NAV_ITEMS.map(({ title, href, Icon, color }) => {
            const active = isItemActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`org-admin-nav-button ${active ? "active" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 9999,
                  fontSize: "0.85rem",
                  fontWeight: active ? 600 : 500,
                  textDecoration: "none",
                  transition: "all 0.15s ease",
                  backgroundColor: active ? `${color}25` : "rgba(255,255,255,0.05)",
                  color: active ? color : "var(--text-secondary)",
                  border: `1px solid ${active ? `${color}60` : "var(--border-glass, rgba(255,255,255,0.12))"}`,
                }}
              >
                <Icon size={15} style={{ color: color }} />
                <span>{title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
