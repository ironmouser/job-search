"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  LayoutDashboard,
  Search,
  GitPullRequest,
  UserCheck,
  CheckCircle2,
} from "lucide-react";

export const RECRUITER_NAV_ITEMS = [
  {
    title: "Dashboard",
    href: "/recruiter",
    Icon: LayoutDashboard,
    color: "#3695e3",
  },
  {
    title: "Job Openings",
    href: "/recruiter/jobs",
    Icon: Briefcase,
    color: "#8b5cf6",
  },
  {
    title: "Candidate Discovery",
    href: "/recruiter/candidates",
    Icon: Search,
    color: "#10b981",
  },
  {
    title: "Pipeline & Introductions",
    href: "/recruiter/pipeline",
    Icon: GitPullRequest,
    color: "#ec4899",
  },
];

interface RecruiterHeaderProps {
  title?: string;
  subtitle?: string;
  hideNav?: boolean;
}

export function RecruiterHeader({ title, subtitle, hideNav = false }: RecruiterHeaderProps) {
  const pathname = usePathname();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean>(false);

  useEffect(() => {
    fetch("/api/recruiter/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data?.hasProfile && data.profile) {
          if (data.profile.organization?.name) {
            setOrgName(data.profile.organization.name);
          }
          if (data.profile.verificationStatus === "VERIFIED") {
            setIsVerified(true);
          }
        }
      })
      .catch(console.error);
  }, []);

  const isItemActive = (href: string) => {
    if (href === "/recruiter") {
      return pathname === "/recruiter";
    }
    return pathname?.startsWith(href);
  };

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <UserCheck size={26} color="#3695e3" />
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
          {title || "Recruiter Portal"}
        </h1>
        {orgName && (
          <span
            style={{
              background: "rgba(54,149,227,0.15)",
              color: "#3695e3",
              border: "1px solid rgba(54,149,227,0.3)",
              padding: "3px 10px",
              borderRadius: 6,
              fontSize: "0.75rem",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {orgName}
            {isVerified && <CheckCircle2 size={12} color="#3695e3" />}
          </span>
        )}
      </div>
      <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 1rem 0", fontSize: "0.9rem" }}>
        {subtitle || "Track positions, discover candidate matches, and manage hiring introductions."}
      </p>

      {!hideNav && (
        <div
          className="recruiter-header-nav"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            paddingTop: "0.75rem",
            borderTop: "1px solid var(--border-glass, rgba(255,255,255,0.1))",
          }}
        >
          {RECRUITER_NAV_ITEMS.map(({ title: navTitle, href, Icon, color }) => {
            const active = isItemActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`recruiter-nav-button ${active ? "active" : ""}`}
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
                <span>{navTitle}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RecruiterHeader;
