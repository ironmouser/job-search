"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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

export default function OrgAdminSeatsPage() {
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
        setOrg((prev) => (prev ? { ...prev, ...data } : { id: orgId, name: sessionUser?.name ?? "Organization", organizationType: "BUSINESS", ...data }));
      })
      .catch(console.error)
      .finally(() => setLoadingOrg(false));
  }, [orgId]);

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem" }}>
      <OrgHeader title="Pass Management" subtitle="Manage organization pass allocations, seat counts, and purchase additional seats." />

      <div style={{ maxWidth: 640 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1.1rem", fontWeight: 600, color: "#f9fafb" }}>
          Pass Allocation & Usage
        </h2>
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
