"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, ShieldCheck, ArrowRight, ShoppingCart, Award } from "lucide-react";
import {
  ORG_TIERS,
  ORG_DURATIONS,
  getTierForQuantity,
  getNextTierUpgrade,
  formatCents,
} from "@/lib/org-pricing";
import { ContactSalesModal } from "./ContactSalesModal";

interface BuySeatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  userEmail?: string;
  userName?: string;
}

export function BuySeatsModal({ isOpen, onClose, orgId, orgName, userEmail = "", userName = "" }: BuySeatsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [quantity, setQuantity] = useState<number>(100);
  const [selectedDuration, setSelectedDuration] = useState<(typeof ORG_DURATIONS)[number]>(ORG_DURATIONS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isContactSalesOpen, setIsContactSalesOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!isOpen || !mounted) return null;

  const currentTier = getTierForQuantity(quantity);
  const nextUpgrade = getNextTierUpgrade(quantity);

  // Exact integer-cents pricing to avoid floating-point drift
  const pricePerSeatCents = currentTier.monthlyRateCents;
  const totalPricePerSeatCents = pricePerSeatCents * selectedDuration.months;
  const grandTotalCents = totalPricePerSeatCents * quantity;

  // Comparison vs Base Standard Tier ($9.99/mo)
  const baseStandardCents = ORG_TIERS[0].monthlyRateCents;
  const standardTotalCents = baseStandardCents * selectedDuration.months * quantity;
  const totalSavingsCents = standardTotalCents - grandTotalCents;

  const handleQuantityChange = (val: number) => {
    const qty = Math.max(1, Math.min(10000, val || 1));
    setQuantity(qty);
    setError(null);
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred during checkout initialization.");
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
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Purchase Organization Passes"
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "1.75rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
          color: "var(--card-foreground)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <ShoppingCart size={20} color="var(--primary, #0070f3)" aria-hidden="true" />
              <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                Purchase Organization Passes
              </h2>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", margin: 0 }}>
              Acquire seat passes for <strong style={{ color: "var(--foreground)" }}>{orgName}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
            }}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 8,
              padding: "12px 14px",
              color: "#ef4444",
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
            background: "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}>Active Tier Rate</span>
            <span
              style={{
                background: currentTier.badgeBg,
                color: currentTier.badgeColor,
                border: `1px solid ${currentTier.badgeColor}40`,
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: "0.75rem",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Award size={14} aria-hidden="true" />
              {quantity >= 5000 ? "Enterprise Tier" : currentTier.name}
            </span>
          </div>

          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>
            {quantity >= 5000 ? (
              "Custom Quote"
            ) : (
              <>
                {formatCents(pricePerSeatCents)}{" "}
                <span style={{ fontSize: "0.875rem", fontWeight: 400, color: "var(--muted-foreground)" }}>
                  / seat / month
                </span>
              </>
            )}
          </div>

          {/* Volume Tier Reference Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: 6,
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--border)",
            }}
          >
            {ORG_TIERS.map((tier) => {
              const isCurrent = quantity < 5000 && currentTier.id === tier.id;
              return (
                <div
                  key={tier.id}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: isCurrent ? "rgba(0, 112, 243, 0.1)" : "var(--card)",
                    border: isCurrent ? "1px solid var(--primary, #0070f3)" : "1px solid var(--border)",
                    fontSize: "0.75rem",
                  }}
                >
                  <div style={{ fontWeight: 700, color: isCurrent ? "var(--primary, #0070f3)" : "var(--foreground)" }}>
                    {tier.name.replace(" Tier", "")} ({tier.discountPercent}% off)
                  </div>
                  <div style={{ color: "var(--muted-foreground)", marginTop: 2 }}>
                    {tier.minSeats}–{tier.maxSeats?.toLocaleString()} · {formatCents(tier.monthlyRateCents)}/mo
                  </div>
                </div>
              );
            })}
          </div>

          {quantity >= 5000 ? (
            <div
              style={{
                marginTop: 12,
                background: "rgba(139, 92, 246, 0.12)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                borderRadius: 8,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#8b5cf6",
                fontSize: "0.8125rem",
                fontWeight: 600,
              }}
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>
                <strong>Enterprise Volume Tier (5,000+ seats):</strong> Custom quote, ACH invoicing &amp; MSA negotiated.
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
                color: "#10b981",
                fontSize: "0.8125rem",
                fontWeight: 600,
              }}
            >
              <Sparkles size={16} aria-hidden="true" />
              <span>
                <strong>Volume Rate Unlocked!</strong> {currentTier.name} ({currentTier.discountLabel}).
              </span>
            </div>
          ) : null}

          {/* Upsell tip if close to next tier */}
          {nextUpgrade && nextUpgrade.seatsNeeded <= 50 && quantity < 5000 && (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "rgba(0, 112, 243, 0.1)",
                border: "1px solid rgba(0, 112, 243, 0.2)",
                borderRadius: 8,
                padding: "10px 12px",
                color: "var(--primary, #0070f3)",
                fontSize: "0.8125rem",
              }}
            >
              <Sparkles size={16} style={{ flexShrink: 0, color: "#f59e0b" }} aria-hidden="true" />
              <span>
                <strong>Save more:</strong> Add {nextUpgrade.seatsNeeded} more seats to unlock{" "}
                <strong>{nextUpgrade.nextTier.name}</strong> ({formatCents(nextUpgrade.nextTier.monthlyRateCents)}/seat/mo)!
              </span>
            </div>
          )}
        </div>

        {/* Step 1: Quantity Selection */}
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="org-seat-qty" style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)", marginBottom: 8 }}>
            Number of Seats / Passes
          </label>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              id="org-seat-qty"
              type="number"
              min={1}
              max={10000}
              value={quantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10))}
              style={{
                flex: 1,
                background: "var(--input, var(--background))",
                border: "1px solid var(--input-border, var(--border))",
                borderRadius: 8,
                padding: "10px 14px",
                color: "var(--foreground)",
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
                  background: quantity === preset ? "rgba(0, 112, 243, 0.14)" : "var(--secondary)",
                  border: quantity === preset ? "1px solid var(--primary, #0070f3)" : "1px solid var(--border)",
                  color: quantity === preset ? "var(--primary, #0070f3)" : "var(--muted-foreground)",
                  padding: "5px 10px",
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
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)", marginBottom: 8 }}>
            Pass Access Duration
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
            {ORG_DURATIONS.map((dur) => {
              const selected = selectedDuration.months === dur.months;
              const perPassCents = pricePerSeatCents * dur.months;
              return (
                <button
                  key={dur.months}
                  type="button"
                  onClick={() => setSelectedDuration(dur)}
                  style={{
                    background: selected ? "rgba(0, 112, 243, 0.12)" : "var(--secondary)",
                    border: selected ? "2px solid var(--primary, #0070f3)" : "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "10px 8px",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ fontSize: "0.875rem", fontWeight: 700, color: selected ? "var(--primary, #0070f3)" : "var(--foreground)" }}>
                    {dur.label}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: 2 }}>
                    {quantity >= 5000 ? "Custom" : `${formatCents(perPassCents)} / pass`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary Card */}
        {quantity < 5000 && (
          <div
            style={{
              background: "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "1rem",
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--muted-foreground)", marginBottom: 6 }}>
              <span>
                {quantity.toLocaleString()} Passes × {selectedDuration.label} ({formatCents(totalPricePerSeatCents)}/pass)
              </span>
              <span>{formatCents(grandTotalCents)}</span>
            </div>

            {totalSavingsCents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "#10b981", marginBottom: 6, fontWeight: 500 }}>
                <span>Volume Discount Savings ({currentTier.discountPercent}% off)</span>
                <span>-{formatCents(totalSavingsCents)}</span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid var(--border)",
                paddingTop: 10,
                marginTop: 6,
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>Total Due Now</span>
              <span style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--primary, #0070f3)" }}>
                {formatCents(grandTotalCents)}
              </span>
            </div>
          </div>
        )}

        {/* Action Button */}
        {quantity >= 5000 ? (
          <button
            type="button"
            onClick={() => setIsContactSalesOpen(true)}
            style={{
              width: "100%",
              background: "var(--primary, #0070f3)",
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
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCheckout}
            disabled={loading}
            style={{
              width: "100%",
              background: loading ? "var(--muted-foreground)" : "var(--primary, #0070f3)",
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
            {!loading && <ArrowRight size={18} aria-hidden="true" />}
          </button>
        )}

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: 12, marginBottom: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem" }}>
          <ShieldCheck size={15} style={{ color: "#10b981" }} aria-hidden="true" /> Secure 256-bit encrypted checkout via Stripe
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
