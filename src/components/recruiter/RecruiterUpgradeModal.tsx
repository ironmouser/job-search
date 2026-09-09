"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Check, ShieldCheck, Zap, Users, BarChart3, Bell, ArrowRight } from "lucide-react";
import { RECRUITER_PLANS } from "@/lib/recruiter/recruiterBillingService";

interface RecruiterUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerAction?: "INTRO" | "JOB" | "SEAT" | "GENERAL";
  candidateName?: string;
  organizationId?: string;
  returnUrl?: string;
}

export function RecruiterUpgradeModal({
  isOpen,
  onClose,
  triggerAction = "GENERAL",
  candidateName,
  organizationId,
  returnUrl,
}: RecruiterUpgradeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"STARTER" | "PRO" | "AGENCY">("PRO");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      // If organizationId not passed, get it from profile
      let orgId = organizationId;
      if (!orgId) {
        const profRes = await fetch("/api/recruiter/profile");
        const profData = await profRes.json();
        orgId = profData?.profile?.organizationId;
      }

      if (!orgId) {
        throw new Error("Recruiter organization could not be identified.");
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recruiterOrgId: orgId,
          planTier: selectedPlan,
          returnUrl: returnUrl || window.location.pathname,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate Stripe checkout.");
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout session URL received.");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred starting checkout.");
      setLoading(false);
    }
  };

  const getHeadline = () => {
    if (triggerAction === "INTRO") {
      return candidateName
        ? `Subscribe to introduce yourself to ${candidateName}`
        : "Subscribe to request candidate introductions";
    }
    if (triggerAction === "JOB") {
      return "Upgrade to activate additional job openings";
    }
    if (triggerAction === "SEAT") {
      return "Upgrade to invite more teammates";
    }
    return "Choose a recruiter subscription plan";
  };

  const getSubheadline = () => {
    if (triggerAction === "INTRO") {
      return "Unlock candidate contact details and initiate warm hiring introductions with verified candidates.";
    }
    if (triggerAction === "JOB") {
      return "Publish more active job requisitions and run continuous AI candidate matching.";
    }
    if (triggerAction === "SEAT") {
      return "Scale your recruiting capacity with multi-seat access and team collaboration tools.";
    }
    return "Transparent pricing tailored for solo sourcers, growing recruiting teams, and staffing agencies.";
  };

  const plans = [
    {
      key: "STARTER" as const,
      name: "Starter",
      price: 99,
      badge: "Solo Sourcing",
      desc: "For independent recruiters and early founders.",
      highlight: false,
      features: [
        "2 active job postings",
        "5 candidate intros / month",
        "$30 overage per additional intro",
        "1 recruiter seat",
        "AI match scoring & fit analysis",
      ],
    },
    {
      key: "PRO" as const,
      name: "Pro",
      price: 249,
      badge: "Most Popular",
      desc: "For growing teams that need volume & collaboration.",
      highlight: true,
      features: [
        "10 active job postings",
        "25 candidate intros / month",
        "$20 overage per additional intro",
        "3 recruiter seats included",
        "Instant candidate alerts",
        "Shared team pipeline & job assignment",
        "Basic conversion & turnaround analytics",
      ],
    },
    {
      key: "AGENCY" as const,
      name: "Agency",
      price: 499,
      badge: "Full Power",
      desc: "For staffing firms and multi-recruiter agencies.",
      highlight: false,
      features: [
        "25 active job postings",
        "75 candidate intros / month",
        "$12 overage per additional intro",
        "10 recruiter seats included",
        "Instant candidate alerts",
        "Team leaderboards & velocity metrics",
        "Advanced client attribution & CSV export",
      ],
    },
  ];

  const modalContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        padding: "1rem",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "880px",
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          color: "var(--card-foreground)",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: "2rem",
          boxSizing: "border-box",
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1.25rem",
            right: "1.25rem",
            background: "var(--secondary)",
            border: "1px solid var(--border)",
            borderRadius: "50%",
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--muted-foreground)",
          }}
          title="Close modal"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.3rem 0.75rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              background: "rgba(54, 149, 227, 0.15)",
              color: "#3695e3",
              border: "1px solid rgba(54, 149, 227, 0.3)",
              marginBottom: "0.75rem",
            }}
          >
            <Zap size={13} />
            <span>Recruiter Portal Access</span>
          </div>
          <h2 style={{ fontSize: "1.6rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>
            {getHeadline()}
          </h2>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.92rem", margin: 0, maxWidth: "600px", marginInline: "auto" }}>
            {getSubheadline()}
          </p>
        </div>

        {/* Plan Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1.25rem",
            marginBottom: "2rem",
          }}
        >
          {plans.map((p) => {
            const isSelected = selectedPlan === p.key;
            return (
              <div
                key={p.key}
                onClick={() => setSelectedPlan(p.key)}
                style={{
                  position: "relative",
                  border: isSelected
                    ? "2px solid #3695e3"
                    : p.highlight
                    ? "1px solid rgba(54, 149, 227, 0.4)"
                    : "1px solid var(--border)",
                  backgroundColor: isSelected
                    ? "rgba(54, 149, 227, 0.08)"
                    : "var(--secondary)",
                  borderRadius: "12px",
                  padding: "1.25rem",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  transition: "all 0.15s ease",
                }}
              >
                {p.highlight && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-10px",
                      right: "16px",
                      background: "linear-gradient(135deg, #3695e3, #2563eb)",
                      color: "#ffffff",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "6px",
                      boxShadow: "0 2px 6px rgba(37, 99, 235, 0.4)",
                    }}
                  >
                    {p.badge}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: isSelected ? "#3695e3" : "var(--foreground)" }}>
                    {p.name}
                  </h3>
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      border: isSelected ? "2px solid #3695e3" : "2px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? "#3695e3" : "transparent",
                    }}
                  >
                    {isSelected && <Check size={12} color="#ffffff" strokeWidth={3} />}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--foreground)" }}>${p.price}</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>/ month</span>
                </div>

                <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", minHeight: "2.4rem", margin: "0 0 1rem 0" }}>
                  {p.desc}
                </p>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.85rem", flex: 1 }}>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {p.features.map((feat, idx) => (
                      <li key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "0.8rem", color: "var(--card-foreground)" }}>
                        <Check size={14} color="#10b981" style={{ flexShrink: 0, marginTop: "2px" }} />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "0.85rem",
              marginBottom: "1.25rem",
            }}
          >
            {error}
          </div>
        )}

        {/* Action Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid var(--border)",
            paddingTop: "1.25rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#10b981", fontSize: "0.82rem" }}>
            <ShieldCheck size={18} />
            <span>Secure 256-bit encrypted checkout via Stripe. Cancel anytime.</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              onClick={onClose}
              style={{
                padding: "0.6rem 1.2rem",
                borderRadius: "8px",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--muted-foreground)",
                fontSize: "0.88rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCheckout}
              disabled={loading}
              style={{
                padding: "0.6rem 1.4rem",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #3695e3, #2563eb)",
                border: "none",
                color: "#ffffff",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)",
              }}
            >
              <span>{loading ? "Connecting to Stripe..." : `Subscribe to ${selectedPlan.charAt(0) + selectedPlan.slice(1).toLowerCase()}`}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default RecruiterUpgradeModal;
