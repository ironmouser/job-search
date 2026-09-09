"use client";

import { useState, useEffect } from "react";
import RecruiterHeader from "@/components/recruiter/RecruiterHeader";
import RecruiterUpgradeModal from "@/components/recruiter/RecruiterUpgradeModal";
import RecruiterTeamModal from "@/components/recruiter/RecruiterTeamModal";
import {
  CreditCard,
  Zap,
  Users,
  Briefcase,
  GitPullRequest,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from "lucide-react";

export default function RecruiterBillingPage() {
  const [entitlements, setEntitlements] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [isTeamOpen, setIsTeamOpen] = useState(false);

  const fetchEntitlements = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recruiter/billing/entitlements");
      const data = await res.json();
      if (data.success) {
        setEntitlements(data.entitlements);
      }
    } catch (err) {
      console.error("Failed to load entitlements:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntitlements();
  }, []);

  const handleLaunchPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/recruiter/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Could not launch Stripe Customer Portal.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to billing portal.");
    } finally {
      setPortalLoading(false);
    }
  };

  const plan = entitlements?.planDetails;
  const isSubscribed = entitlements?.isSubscribed;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem" }}>
      <RecruiterHeader
        title="Billing & Subscription"
        subtitle="Manage your recruiting tier, monthly introduction quotas, and team seat allocations."
      />

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>
          Loading billing details...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Plan Overview Hero Card */}
          <div
            style={{
              padding: "1.75rem",
              borderRadius: "14px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1.5rem",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "0.5rem" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "3px 10px",
                    borderRadius: "6px",
                    background: isSubscribed ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                    color: isSubscribed ? "#10b981" : "#f59e0b",
                    border: `1px solid ${isSubscribed ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                  }}
                >
                  {isSubscribed ? `${entitlements.planTier} PLAN` : "FREE EXPLORER"}
                </span>

                {entitlements?.currentPeriodEnd && (
                  <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                    Renews on {new Date(entitlements.currentPeriodEnd).toLocaleDateString()}
                  </span>
                )}
              </div>

              <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.4rem 0", color: "var(--foreground)" }}>
                {plan ? `${plan.name} Plan ($${plan.priceMonthly}/mo)` : "Free Explorer Account"}
              </h2>
              <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.9rem" }}>
                {isSubscribed
                  ? "Your organization has full access to send warm candidate introductions, unmask talent, and collaborate."
                  : "Explore candidate discovery and match analytics for free. Upgrade to request introductions and publish live jobs."}
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              {isSubscribed && (
                <button
                  onClick={handleLaunchPortal}
                  disabled={portalLoading}
                  style={{
                    padding: "0.6rem 1.15rem",
                    borderRadius: "8px",
                    background: "var(--secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontSize: "0.88rem",
                    fontWeight: 500,
                    cursor: portalLoading ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <CreditCard size={15} />
                  <span>{portalLoading ? "Opening..." : "Manage Invoices & Card"}</span>
                  <ExternalLink size={13} style={{ opacity: 0.7 }} />
                </button>
              )}

              <button
                onClick={() => setIsUpgradeOpen(true)}
                style={{
                  padding: "0.6rem 1.25rem",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #3695e3, #2563eb)",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
                }}
              >
                <Sparkles size={15} />
                <span>{isSubscribed ? "Change Plan Tier" : "Upgrade Plan"}</span>
              </button>
            </div>
          </div>

          {/* Quota & Usage Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {/* Introductions Quota Card */}
            <div
              style={{
                padding: "1.5rem",
                borderRadius: "12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <GitPullRequest size={18} color="#ec4899" />
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
                    Candidate Introductions
                  </h3>
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#ec4899" }}>
                  {entitlements?.intros.remaining} Remaining
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--foreground)" }}>
                  {entitlements?.intros.consumed}
                </span>
                <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
                  / {entitlements?.intros.monthlyQuota} Used this month
                </span>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  height: "8px",
                  borderRadius: "9999px",
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${
                      entitlements?.intros.monthlyQuota > 0
                        ? Math.min(100, (entitlements.intros.consumed / entitlements.intros.monthlyQuota) * 100)
                        : 0
                    }%`,
                    background: "linear-gradient(90deg, #ec4899, #f43f5e)",
                    borderRadius: "9999px",
                  }}
                />
              </div>

              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Overage rate: ${entitlements?.intros.overagePrice} per additional introduction if monthly quota is reached.
              </div>
            </div>

            {/* Active Jobs Card */}
            <div
              style={{
                padding: "1.5rem",
                borderRadius: "12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Briefcase size={18} color="#8b5cf6" />
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
                    Active Job Openings
                  </h3>
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#8b5cf6" }}>
                  {Math.max(0, (entitlements?.jobs.quota || 0) - (entitlements?.jobs.activeCount || 0))} Slots Available
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--foreground)" }}>
                  {entitlements?.jobs.activeCount}
                </span>
                <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
                  / {entitlements?.jobs.quota} Active Openings
                </span>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  height: "8px",
                  borderRadius: "9999px",
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${
                      entitlements?.jobs.quota > 0
                        ? Math.min(100, (entitlements.jobs.activeCount / entitlements.jobs.quota) * 100)
                        : 0
                    }%`,
                    background: "linear-gradient(90deg, #8b5cf6, #6366f1)",
                    borderRadius: "9999px",
                  }}
                />
              </div>

              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Active jobs continuously receive automated candidate matching and fit scoring.
              </div>
            </div>

            {/* Team Seats Card */}
            <div
              style={{
                padding: "1.5rem",
                borderRadius: "12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Users size={18} color="#10b981" />
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
                    Team Seats & Colleague Access
                  </h3>
                </div>
                <button
                  onClick={() => setIsTeamOpen(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#3695e3",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Manage Team &rarr;
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--foreground)" }}>
                  {entitlements?.seats.activeRecruiters + entitlements?.seats.pendingInvites}
                </span>
                <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
                  / {entitlements?.seats.totalSeats} Seats Claimed
                </span>
              </div>

              {/* Progress Bar */}
              <div
                style={{
                  height: "8px",
                  borderRadius: "9999px",
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                  marginBottom: "0.75rem",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${
                      entitlements?.seats.totalSeats > 0
                        ? Math.min(
                            100,
                            ((entitlements.seats.activeRecruiters + entitlements.seats.pendingInvites) /
                              entitlements.seats.totalSeats) *
                              100
                          )
                        : 0
                    }%`,
                    background: "linear-gradient(90deg, #10b981, #059669)",
                    borderRadius: "9999px",
                  }}
                />
              </div>

              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Collaboration and multi-seat access are enabled on Pro (3 seats) and Agency (10 seats) plans.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      <RecruiterUpgradeModal
        isOpen={isUpgradeOpen}
        onClose={() => {
          setIsUpgradeOpen(false);
          fetchEntitlements();
        }}
        organizationId={entitlements?.organizationId}
      />

      {/* Team Modal */}
      <RecruiterTeamModal
        isOpen={isTeamOpen}
        onClose={() => {
          setIsTeamOpen(false);
          fetchEntitlements();
        }}
        onOpenUpgradeModal={() => setIsUpgradeOpen(true)}
      />
    </div>
  );
}
