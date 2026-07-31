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

  // Auth guard — client-side backup
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
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <Building2 size={48} color="#9ca3af" style={{ marginBottom: 16 }} />
        <h2 style={{ color: "#f9fafb" }}>No Organization Found</h2>
        <p style={{ color: "#9ca3af" }}>You are not currently a member of any organization.</p>
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
      description: "Invite new users to your organization.",
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
    <div style={{ minHeight: "100vh", padding: "1.5rem" }}>
      <OrgHeader />

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: "2rem" }}>
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
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "1.5rem",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#9ca3af", marginBottom: 8 }}>{label}</p>
            <p style={{ margin: 0, fontSize: "2rem", fontWeight: 700, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Seat Usage Overview */}
      <div style={{ marginBottom: "2.5rem" }}>
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
      <div>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#f9fafb", marginBottom: "1rem" }}>
          Quick Management Actions
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {quickLinks.map(({ title, description, href, Icon, color }) => (
            <Link
              key={title}
              href={href}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
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
                    <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#f9fafb" }}>
                      {title}
                    </h3>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "#9ca3af", lineHeight: 1.4 }}>
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
