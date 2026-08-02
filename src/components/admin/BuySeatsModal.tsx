"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, ShieldCheck, ArrowRight, ShoppingCart, CheckCircle2, Award } from "lucide-react";
import { ORG_TIERS, getTierForQuantity, getNextTierUpgrade } from "@/lib/org-pricing";
import { ContactSalesModal } from "./ContactSalesModal";

interface BuySeatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  userEmail?: string;
  userName?: string;
}

const DURATIONS = [
  { label: "1 Month", months: 1, validityDays: 30, discount: "" },
  { label: "3 Months", months: 3, validityDays: 90, discount: "" },
  { label: "6 Months", months: 6, validityDays: 180, discount: "" },
  { label: "1 Year", months: 12, validityDays: 365, discount: "Popular" },
];

export function BuySeatsModal({ isOpen, onClose, orgId, orgName, userEmail = "", userName = "" }: BuySeatsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [quantity, setQuantity] = useState<number>(100);
  const [selectedDuration, setSelectedDuration] = useState(DURATIONS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isContactSalesOpen, setIsContactSalesOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const currentTier = getTierForQuantity(quantity);
  const nextUpgrade = getNextTierUpgrade(quantity);

  // Price calculations
  const pricePerSeatPerMonth = currentTier.monthlyRatePerSeat;
  const totalPricePerSeat = pricePerSeatPerMonth * selectedDuration.months;
  const grandTotal = totalPricePerSeat * quantity;

  // Comparison vs Base Standard Tier
  const baseStandardMonthly = ORG_TIERS[0].monthlyRatePerSeat; // 20
  const standardTotal = baseStandardMonthly * selectedDuration.months * quantity;
  const totalSavings = standardTotal - grandTotal;

  const handleQuantityChange = (val: number) => {
    const qty = Math.max(1, Math.min(10000, val || 1));
    setQuantity(qty);
    setError(null);
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      // In production, price IDs can be retrieved from environment/config or Stripe
      const priceId = process.env.NEXT_PUBLIC_STRIPE_ORG_PRICE_ID || "price_dummy";

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          organizationId: orgId,
          quantity,
          durationMonths: selectedDuration.months,
          tier: currentTier.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize checkout");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during checkout initialization.");
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#111827",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          padding: "1.75rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          color: "#f9fafb",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <ShoppingCart size={20} color="#3695e3" />
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                Purchase Organization Passes
              </h2>
            </div>
            <p style={{ fontSize: "0.875rem", color: "#9ca3af", margin: 0 }}>
              Acquire seat passes for <strong style={{ color: "#f3f4f6" }}>{orgName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 8,
              padding: "12px 14px",
              color: "#fca5a5",
              fontSize: "0.875rem",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {/* Tier Selector & Info Card */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: "0.875rem", color: "#9ca3af" }}>Active Tier Rate</span>
            <span
              style={{
                background: currentTier.badgeBg,
                color: currentTier.badgeColor,
                border: `1px solid ${currentTier.badgeColor}40`,
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: "0.8rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Award size={14} />
              {currentTier.name}
            </span>
          </div>

          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f9fafb" }}>
            ${pricePerSeatPerMonth}{" "}
            <span style={{ fontSize: "0.875rem", fontWeight: 400, color: "#9ca3af" }}>
              / seat / month
            </span>
          </div>

          {/* Option A Auto-Upgrade Notification Banner */}
          {quantity >= 5000 ? (
            <div
              style={{
                marginTop: 12,
                background: "rgba(139, 92, 246, 0.15)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#c084fc",
                fontSize: "0.8rem",
                fontWeight: 600,
              }}
            >
              <Sparkles size={16} />
              <span>
                <strong>Enterprise Volume Tier (5,000+ seats):</strong> Requires custom quote, ACH invoicing & MSA agreement.
              </span>
            </div>
          ) : currentTier.id !== "standard" ? (
            <div
              style={{
                marginTop: 12,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#34d399",
                fontSize: "0.8rem",
                fontWeight: 600,
              }}
            >
              <Sparkles size={16} />
              <span>
                <strong>Volume Rate Unlocked!</strong> You automatically qualified for {currentTier.name} ({currentTier.discountLabel}).
              </span>
            </div>
          ) : null}

          {/* Upsell tip if close to next tier */}
          {nextUpgrade && nextUpgrade.seatsNeeded <= 50 && (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: 8,
                padding: "10px 12px",
                color: "#60a5fa",
                fontSize: "0.8rem",
              }}
            >
              <Sparkles size={16} style={{ flexShrink: 0, color: "#f59e0b" }} />
              <span>
                <strong>Save more:</strong> Add {nextUpgrade.seatsNeeded} more seats to unlock{" "}
                <strong>{nextUpgrade.nextTier.name}</strong> (${nextUpgrade.nextTier.monthlyRatePerSeat}/seat/mo)!
              </span>
            </div>
          )}
        </div>

        {/* Step 1: Quantity Selection */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#d1d5db", marginBottom: 8 }}>
            Number of Seats / Passes
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="number"
              min={1}
              max={10000}
              value={quantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10))}
              style={{
                flex: 1,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: 8,
                padding: "10px 14px",
                color: "#ffffff",
                fontSize: "1rem",
                fontWeight: 600,
                outline: "none",
              }}
            />
          </div>

          {/* Quick presets */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[10, 50, 100, 250, 500].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleQuantityChange(preset)}
                style={{
                  background: quantity === preset ? "rgba(54, 149, 227, 0.2)" : "rgba(255, 255, 255, 0.04)",
                  border: quantity === preset ? "1px solid #3695e3" : "1px solid rgba(255, 255, 255, 0.1)",
                  color: quantity === preset ? "#3695e3" : "#9ca3af",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {preset} seats
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Duration Selection */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#d1d5db", marginBottom: 8 }}>
            Pass Access Duration
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {DURATIONS.map((dur) => {
              const selected = selectedDuration.months === dur.months;
              return (
                <button
                  key={dur.months}
                  type="button"
                  onClick={() => setSelectedDuration(dur)}
                  style={{
                    background: selected ? "rgba(54, 149, 227, 0.15)" : "rgba(255, 255, 255, 0.03)",
                    border: selected ? "2px solid #3695e3" : "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 10,
                    padding: "10px 8px",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ fontSize: "0.875rem", fontWeight: 700, color: selected ? "#ffffff" : "#d1d5db" }}>
                    {dur.label}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 2 }}>
                    {dur.validityDays} days
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary Card */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: 12,
            padding: "1rem",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "#9ca3af", marginBottom: 6 }}>
            <span>{quantity} Passes × {selectedDuration.label} (${totalPricePerSeat}/pass)</span>
            <span>${grandTotal.toLocaleString()}</span>
          </div>

          {totalSavings > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#34d399", marginBottom: 6 }}>
              <span>Volume Discount Savings</span>
              <span>-${totalSavings.toLocaleString()}</span>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              paddingTop: 10,
              marginTop: 6,
            }}
          >
            <span style={{ fontWeight: 600, color: "#f3f4f6" }}>Total Due Now</span>
            <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "#3695e3" }}>
              ${grandTotal.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Action Button */}
        {quantity >= 5000 ? (
          <button
            onClick={() => setIsContactSalesOpen(true)}
            style={{
              width: "100%",
              background: "#8b5cf6",
              color: "#ffffff",
              border: "none",
              borderRadius: 10,
              padding: "12px 20px",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxSizing: "border-box",
            }}
          >
            Contact Enterprise Sales for Custom Quote
            <ArrowRight size={18} />
          </button>
        ) : (
          <button
            onClick={handleCheckout}
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "#4b5563" : "#3695e3",
              color: "#ffffff",
              border: "none",
              borderRadius: 10,
              padding: "12px 20px",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {loading ? "Preparing Checkout..." : "Proceed to Secure Stripe Checkout"}
            {!loading && <ArrowRight size={18} />}
          </button>
        )}

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#6b7280", marginTop: 12, marginBottom: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem" }}>
          <ShieldCheck size={15} style={{ color: "#10b981" }} /> Secure 256-bit encrypted checkout via Stripe
        </p>

        <ContactSalesModal
          isOpen={isContactSalesOpen}
          onClose={() => setIsContactSalesOpen(false)}
          orgId={orgId}
          orgName={orgName}
          initialSeats={quantity}
          initialUserEmail={userEmail}
          initialUserName={userName}
        />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
