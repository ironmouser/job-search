"use client";

import { Users, ShoppingCart } from "lucide-react";

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
    <div className="glass-card" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(54,149,227,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={20} color="#3695e3" />
          </div>
          <span style={{ fontWeight: 600, fontSize: "1.25rem", color: "var(--text-primary)" }}>Pass Inventory</span>
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
              padding: "8px 16px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <ShoppingCart size={16} /> Buy More Passes
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading...</div>
      ) : (
        <>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
              }}
            >
              <span>
                <strong style={{ color: "var(--text-primary)" }}>{consumedSeats}</strong> of{" "}
                <strong style={{ color: "var(--text-primary)" }}>{seatCount}</strong> passes consumed
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
                fontSize: "0.85rem",
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 4 }}>
             <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: 10, border: "1px solid var(--border-glass)" }}>
               <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Active Users</div>
               <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{activeUnexpiredSeats}</div>
             </div>
             <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: 10, border: "1px solid var(--border-glass)" }}>
               <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Purchased (Last 30 Days)</div>
               <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{stats?.purchased30Days || 0}</div>
             </div>
             <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: 10, border: "1px solid var(--border-glass)" }}>
               <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Purchased (This Year)</div>
               <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{stats?.purchasedThisYear || 0}</div>
             </div>
             <div style={{ background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: 10, border: "1px solid var(--border-glass)" }}>
               <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Purchased (365 Days)</div>
               <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>{stats?.purchased365Days || 0}</div>
             </div>
          </div>

          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic", margin: 0, borderTop: "1px solid var(--border-glass)", paddingTop: 12, lineHeight: 1.4 }}>
            * Notice: Organization seat passes expire 1 year (365 days) from the purchase date if left unassigned.
          </p>
        </>
      )}
    </div>
  );
}
