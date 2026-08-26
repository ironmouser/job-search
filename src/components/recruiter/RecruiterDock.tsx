"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCommandBar } from "@/contexts/AutoApplyBarContext";
import {
  LayoutDashboard,
  Briefcase,
  Search,
  GitPullRequest,
  UserCheck,
} from "lucide-react";
import { RECRUITER_NAV_ITEMS } from "./RecruiterHeader";

export function RecruiterDock() {
  const pathname = usePathname();
  const { setPageActions } = useCommandBar();

  const isRecruiterRoute = pathname?.startsWith("/recruiter") && pathname !== "/recruiter/register";

  useEffect(() => {
    if (!isRecruiterRoute) {
      setPageActions(null);
      return;
    }

    const isItemActive = (href: string) => {
      if (href === "/recruiter") {
        return pathname === "/recruiter";
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
          <UserCheck size={14} color="#3695e3" />
          <span>Recruiter Portal</span>
        </div>

        <div className="command-bar-divider" />

        {RECRUITER_NAV_ITEMS.map(({ title, href, Icon, color }) => {
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
  }, [pathname, isRecruiterRoute, setPageActions]);

  return null;
}

export default RecruiterDock;
