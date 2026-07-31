"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";

import { OrgHeader } from "@/components/admin/OrgHeader";
import { ActivityLogTable, ActivityLogEntry } from "@/components/admin/ActivityLogTable";

export default function OrgAdminActivityPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const sessionUser = session?.user as any;
  const orgId = sessionUser?.organizationId as string | null;

  const [activityEntries, setActivityEntries] = useState<ActivityLogEntry[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [loadingActivity, setLoadingActivity] = useState(true);

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
    loadActivity(1);
  }, [orgId]);

  const loadActivity = async (page: number) => {
    if (!orgId) return;
    setLoadingActivity(true);
    try {
      const res = await fetch(`/api/org/${orgId}/activity?page=${page}&pageSize=50`);
      const data = await res.json();
      setActivityEntries(data.logs ?? []);
      setActivityTotal(data.total ?? 0);
      setActivityPage(data.page ?? 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingActivity(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem 0" }}>
      <OrgHeader title="Organization Activity Log" subtitle="Audit activity history, seat assignments, invitations, and configuration changes." />

      <div className="glass-card" style={{ padding: "1.75rem" }}>
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1.5rem" }}>
          <Activity size={22} color="#ec4899" /> Audit Events ({activityTotal})
        </h3>
        <ActivityLogTable
          entries={activityEntries}
          total={activityTotal}
          page={activityPage}
          pageSize={50}
          onPageChange={(p) => loadActivity(p)}
          loading={loadingActivity}
        />
      </div>
    </div>
  );
}
