"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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
    <div style={{ minHeight: "100vh", padding: "1.5rem" }}>
      <OrgHeader title="Organization Activity Log" subtitle="Audit activity history, seat assignments, invitations, and configuration changes." />

      <div>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600, color: "#f9fafb" }}>
          Audit Events
        </h2>
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
