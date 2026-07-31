"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Mail,
  Cpu,
  Settings,
  Activity,
  ArrowRight,
  Building2,
  LayoutDashboard,
  ShieldAlert,
} from "lucide-react";

import { OrgHeader } from "@/components/admin/OrgHeader";
import { SeatUsageCard } from "@/components/admin/SeatUsageCard";
import { BuySeatsModal } from "@/components/admin/BuySeatsModal";

interface Organization {
  id: string;
  name: string;
  organizationType: string;
  seatCount: number;
  consumedSeats: number;
  remainingSeats: number;
  activeUnexpiredSeats: number;
  stats?: {
    purchased30Days: number;
    purchased6Months: number;
    purchasedThisYear: number;
    purchased365Days: number;
  };
}

export default function OrgAdminDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const sessionUser = session?.user as any;
  const orgId = sessionUser?.organizationId as string | null;

  const [org, setOrg] = useState<Organization | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [isBuyModalOpen, setIsBuyModalOpen] = useState(false);

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
    setLoadingOrg(true);
    fetch(`/api/org/${orgId}/seats`)
      .then((r) => r.json())
      .then((data) => {
        setOrg({
          id: orgId,
          name: sessionUser?.name ?? "My Organization",
          organizationType: "BUSINESS",
          ...data,
        });
      })
      .catch(console.error)
      .finally(() => setLoadingOrg(false));
  }, [orgId]);

  if (!orgId && !loadingOrg) {
    return (
      <div className="glass-card" style={{ padding: "4rem 2rem", textAlign: "center", maxWidth: 500, margin: "4rem auto" }}>
        <Building2 size={48} color="var(--text-secondary)" style={{ marginBottom: 16 }} />
        <h2 style={{ color: "var(--text-primary)", fontSize: "1.5rem" }}>No Organization Found</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>You are not currently a member of any organization.</p>
      </div>
    );
  }

  const quickLinks = [
    {
      title: "Members",
      description: "Manage team members, roles, and access.",
      href: "/org-admin/members",
      Icon: Users,
      color: "#3695e3",
    },
    {
      title: "Invitations",
      description: "Invite new users in bulk to your organization.",
      href: "/org-admin/invitations",
      Icon: Mail,
      color: "#10b981",
    },
    {
      title: "Pass Management",
      description: "Purchase and track pass allocations.",
      href: "/org-admin/seats",
      Icon: Cpu,
      color: "#8b5cf6",
    },
    {
      title: "Org Settings",
      description: "View organization configuration.",
      href: "/org-admin/settings",
      Icon: Settings,
      color: "#f59e0b",
    },
    {
      title: "Activity Log",
      description: "Audit organization events and history.",
      href: "/org-admin/activity",
      Icon: Activity,
      color: "#ec4899",
    },
  ];

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem 0" }}>
      <OrgHeader />

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: "2rem" }}>
        {[
          {
            label: "Passes Consumed",
            value: org?.consumedSeats ?? "—",
            color: "#3695e3",
          },
          {
            label: "Total Passes",
            value: org?.seatCount ?? "—",
            color: "#8b5cf6",
          },
          {
            label: "Available Passes",
            value: org?.remainingSeats ?? "—",
            color: "#10b981",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="glass-card"
            style={{ padding: "1.5rem" }}
          >
            <p style={{ margin: 0, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 8, fontWeight: 600 }}>{label}</p>
            <p style={{ margin: 0, fontSize: "2rem", fontWeight: 700, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Seat Usage Overview */}
      <div style={{ marginBottom: "2rem" }}>
        <SeatUsageCard
          seatCount={org?.seatCount ?? 0}
          consumedSeats={org?.consumedSeats ?? 0}
          remainingSeats={org?.remainingSeats ?? 0}
          activeUnexpiredSeats={org?.activeUnexpiredSeats ?? 0}
          stats={org?.stats}
          onPurchaseMore={() => setIsBuyModalOpen(true)}
          loading={loadingOrg}
        />
      </div>

      {/* Quick Navigation Cards */}
      <div className="glass-card" style={{ padding: "1.75rem" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1.5rem" }}>
          <LayoutDashboard size={22} color="#3695e3" /> Quick Management Actions
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {quickLinks.map(({ title, description, href, Icon, color }) => (
            <Link
              key={title}
              href={href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-glass)",
                  borderRadius: 12,
                  padding: "1.25rem",
                  transition: "all 0.2s ease",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  height: "100%",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div
                      style={{
                        background: `${color}20`,
                        color: color,
                        padding: 8,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={20} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", textTransform: "none", letterSpacing: "normal" }}>
                      {title}
                    </h4>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    {description}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: color, fontSize: "0.8rem", fontWeight: 600, marginTop: 16 }}>
                  Manage {title} <ArrowRight size={14} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <BuySeatsModal
        isOpen={isBuyModalOpen}
        onClose={() => setIsBuyModalOpen(false)}
        orgId={orgId ?? ""}
        orgName={org?.name ?? "Organization"}
        userEmail={sessionUser?.email ?? ""}
        userName={sessionUser?.name ?? ""}
      />
    </div>
  );
}
