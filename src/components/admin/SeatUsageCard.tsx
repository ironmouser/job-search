"use client";

import { Users, ShoppingCart, TrendingUp } from "lucide-react";

interface SeatUsageCardProps {
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
  onPurchaseMore?: () => void;
  loading?: boolean;
}

export function SeatUsageCard({
  seatCount,
  consumedSeats,
  remainingSeats,
  activeUnexpiredSeats,
  stats,
  onPurchaseMore,
  loading = false,
}: SeatUsageCardProps) {
  const usagePct = seatCount > 0 ? Math.min(100, (consumedSeats / seatCount) * 100) : 0;
  const isNearEmpty = remainingSeats <= 2 && seatCount > 0;
  const isEmpty = remainingSeats <= 0 && seatCount > 0;

  const barColor = isEmpty ? "#ef4444" : isNearEmpty ? "#f59e0b" : "#10b981";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "rgba(54,149,227,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={18} color="#3695e3" />
          </div>
          <span style={{ fontWeight: 600, fontSize: "1rem" }}>Pass Inventory</span>
        </div>
        {onPurchaseMore && (
          <button
            onClick={onPurchaseMore}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(54,149,227,0.15)",
              border: "1px solid rgba(54,149,227,0.3)",
              borderRadius: 8,
              color: "#3695e3",
              padding: "6px 14px",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <ShoppingCart size={14} /> Buy More Passes
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: "0.875rem" }}>Loading...</div>
      ) : (
        <>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
                fontSize: "0.875rem",
                color: "#9ca3af",
              }}
            >
              <span>
                <strong style={{ color: "#f9fafb" }}>{consumedSeats}</strong> of{" "}
                <strong style={{ color: "#f9fafb" }}>{seatCount}</strong> passes consumed
              </span>
              <span style={{ color: isEmpty ? "#ef4444" : isNearEmpty ? "#f59e0b" : "#10b981", fontWeight: 600 }}>
                {remainingSeats} available
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                height: 8,
                background: "rgba(255,255,255,0.1)",
                borderRadius: 4,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${usagePct}%`,
                  background: barColor,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>

          {isEmpty && (
            <p
              style={{
                fontSize: "0.8rem",
                color: "#ef4444",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 8,
                padding: "10px 14px",
                margin: 0,
              }}
            >
              All passes are consumed. Purchase additional passes to invite more members.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 8 }}>
             <div style={{ background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
               <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: 4 }}>Active Users (Not Expired)</div>
               <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f9fafb" }}>{activeUnexpiredSeats}</div>
             </div>
             <div style={{ background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
               <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: 4 }}>Passes Purchased (Last 30 Days)</div>
               <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f9fafb" }}>{stats?.purchased30Days || 0}</div>
             </div>
             <div style={{ background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
               <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: 4 }}>Passes Purchased (This Year)</div>
               <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f9fafb" }}>{stats?.purchasedThisYear || 0}</div>
             </div>
             <div style={{ background: "rgba(255,255,255,0.02)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
               <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginBottom: 4 }}>Passes Purchased (Past 365 Days)</div>
               <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "#f9fafb" }}>{stats?.purchased365Days || 0}</div>
             </div>
          </div>
        </>
      )}
    </div>
  );
}
