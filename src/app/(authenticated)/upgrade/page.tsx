"use client";

import { useState, useEffect, Suspense } from "react";
import { Check, Loader2, Sparkles, Zap, Building2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

import { PageHeader, PageHeaderHeading, PageHeaderDescription } from '@/components/ui/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function PricingContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const sessionUser = session?.user as any;
  const isOrgUser = !!sessionUser?.organizationId || sessionUser?.role === "ORGANIZATION_ADMIN" || sessionUser?.role === "SYSTEM_ADMIN";

  const handleSubscribe = async () => {
    if (!session) {
      router.push("/checkout");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || "price_dummy",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error("Subscription error:", error);
      setIsLoading(false);
    }
  };

  // Auto-trigger checkout when ?checkout=true or ?auto=true and session is ready
  useEffect(() => {
    const shouldAutoCheckout =
      searchParams?.get("checkout") === "true" || searchParams?.get("auto") === "true";
    if (!shouldAutoCheckout || !session) return;
    window.location.href = "/api/stripe/checkout";
  }, [searchParams, session]);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: "4rem" }}>
      <PageHeader>
        <div>
          <PageHeaderHeading>Subscription Plans</PageHeaderHeading>
          <PageHeaderDescription>Choose the right plan to get AI-powered match scoring, automated asset generation, and execution tools</PageHeaderDescription>
        </div>
      </PageHeader>

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", justifyContent: "center", position: "relative", zIndex: 10, maxWidth: "1150px", width: "100%" }}>
        
        {/* Free Tier */}
        <div className="glass-card" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            Starter
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            Free tier with 7-day Pro trial included (no card required).
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", marginBottom: "2rem" }}>
            <span style={{ fontSize: "3rem", fontWeight: 700, color: "var(--text-primary)" }}>$0</span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>/month</span>
          </div>
          <button
            disabled
            className="btn-outline"
            style={{ width: "100%", marginBottom: "2rem", opacity: 0.5 }}
          >
            Current Plan
          </button>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "1rem", padding: 0 }}>
            {[
              "Instant 7-day Pro trial unlock",
              "Multi-board job search",
              "1 tailored resume generation / week (after trial)",
              "All created work & saved jobs preserved forever"
            ].map((feature) => (
              <li key={feature} style={{ display: "flex", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                <Check size={20} color="#3695e3" style={{ flexShrink: 0 }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pro Tier */}
        <div className="glass-card" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", border: "2px solid #3695e3", background: "rgba(54, 149, 227, 0.05)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-40px", right: "-40px", opacity: 0.1, transform: "rotate(12deg)", pointerEvents: "none" }}>
            <Sparkles size={160} color="#3695e3" />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Pro <Zap size={20} color="#f2a900" fill="currentColor" />
            </h3>
            <span style={{ background: "rgba(54, 149, 227, 0.2)", color: "#3695e3", padding: "0.25rem 0.75rem", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 600 }}>
              Most popular
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            Advanced AI tools for serious candidates.
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", marginBottom: "2rem" }}>
            <span style={{ fontSize: "3rem", fontWeight: 700, color: "var(--text-primary)" }}>$20</span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>/month</span>
          </div>
          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className="btn-primary"
            style={{ width: "100%", marginBottom: "2rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : "Upgrade to Pro"}
          </button>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "1rem", padding: 0 }}>
            {[
              "Unlimited job discoveries",
              "Advanced AI Opportunity Scoring",
              "Automated Resume Tailoring",
              "Custom Cover Letter Generation",
              "Interview Prep & Insights",
              "Priority Support"
            ].map((feature) => (
              <li key={feature} style={{ display: "flex", gap: "0.75rem", color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 500 }}>
                <Check size={20} color="#3695e3" style={{ flexShrink: 0 }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Organization Plan */}
        <div className="glass-card" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", border: "1px solid var(--border-glass)", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Organization <Building2 size={20} color="#8b5cf6" />
            </h3>
            <span style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a78bfa", padding: "0.25rem 0.75rem", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 600 }}>
              Teams & Orgs
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            Multi-seat passes for businesses, career centers & agencies.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Starting at</span>
              <span style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>$10</span>
              <span style={{ color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.95rem" }}>/ seat pass</span>
            </div>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: 500 }}>Based on access duration & quantity purchased</span>
          </div>
          <button
            onClick={() => {
              if (isOrgUser) {
                router.push("/org-admin");
              } else {
                window.location.href = "mailto:support@jobagenthq.com?subject=Organization%20Account%20Inquiry";
              }
            }}
            className="btn-outline"
            style={{ width: "100%", marginBottom: "2rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
          >
            {isOrgUser ? "Manage Org Passes" : "Contact Sales / Buy Passes"}
          </button>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "1rem", padding: 0, margin: "0 0 1.25rem 0" }}>
            {[
              "Multi-seat pass management dashboard",
              "Batch candidate & student email invitations",
              "30-day (or custom) access per activated pass",
              "Full Pro features for all assigned members",
              "Centralized activity logs & seat usage metrics"
            ].map((feature) => (
              <li key={feature} style={{ display: "flex", gap: "0.75rem", color: "var(--text-primary)", fontSize: "0.95rem", fontWeight: 500 }}>
                <Check size={20} color="#8b5cf6" style={{ flexShrink: 0 }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", margin: 0, fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "0.75rem", lineHeight: 1.4 }}>
            * Unassigned organization seat passes expire 1 year (365 days) after purchase.
          </p>
        </div>

      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}><Loader2 className="animate-spin" size={32} color="#3695e3" /></div>}>
      <PricingContent />
    </Suspense>
  );
}
