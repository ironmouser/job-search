"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCommandBar } from "@/contexts/AutoApplyBarContext";
import {
  LayoutDashboard,
  Users,
  Mail,
  Cpu,
  Settings,
  Activity,
  Shield,
} from "lucide-react";

export const ORG_ADMIN_QUICK_ACTIONS = [
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

export function OrgAdminDock() {
  const pathname = usePathname();
  const { setPageActions } = useCommandBar();

  const isOrgAdminRoute = pathname?.startsWith("/org-admin");

  useEffect(() => {
    if (!isOrgAdminRoute) {
      return;
    }

    const isItemActive = (href: string) => {
      if (href === "/org-admin") {
        return pathname === "/org-admin";
      }
      return pathname?.startsWith(href);
    };

    setPageActions(
      <div className="command-bar-actions-group">
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.35rem 0.75rem",
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "#3695e3",
            background: "rgba(54, 149, 227, 0.12)",
            border: "1px solid rgba(54, 149, 227, 0.25)",
            borderRadius: "9999px",
            whiteSpace: "nowrap",
          }}
        >
          <Shield size={14} color="#3695e3" />
          <span>Org Admin</span>
        </div>

        <div className="command-bar-divider" />

        {ORG_ADMIN_QUICK_ACTIONS.map(({ title, href, Icon, color }) => {
          const active = isItemActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`command-bar-btn ${active ? "command-bar-btn-primary" : ""}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                textDecoration: "none",
                ...(active
                  ? { backgroundColor: `${color}25`, borderColor: `${color}60`, color: color }
                  : {}),
              }}
              title={`Navigate to ${title}`}
            >
              <Icon size={14} style={{ color: color }} />
              <span>{title}</span>
            </Link>
          );
        })}
      </div>
    );

    return () => {
      setPageActions(null);
    };
  }, [pathname, isOrgAdminRoute, setPageActions]);

  return null;
}

export default OrgAdminDock;
