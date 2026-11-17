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
  const isPro = sessionUser?.planTier === "PRO";
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
        <div className="glass-card" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", background: "var(--card)", border: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.5rem" }}>
            Starter
          </h3>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            Free tier with 7-day Pro trial included (no card required).
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", marginBottom: "2rem" }}>
            <span style={{ fontSize: "3rem", fontWeight: 700, color: "var(--foreground)" }}>$0</span>
            <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>/month</span>
          </div>
          <Button
            variant="outline"
            disabled
            style={{ width: "100%", marginBottom: "2rem" }}
          >
            {isPro ? "Included in Pro" : "Current Plan"}
          </Button>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "1rem", padding: 0, color: "var(--muted-foreground)" }}>
            {[
              "Instant 7-day Pro trial unlock",
              "Multi-board job search",
              "1 tailored resume generation / week (after trial)",
              "All created work & saved jobs preserved forever"
            ].map((feature) => (
              <li key={feature} style={{ display: "flex", gap: "0.75rem", color: "var(--muted-foreground)", fontSize: "0.95rem" }}>
                <Check size={20} color="#3695e3" style={{ flexShrink: 0 }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pro Tier */}
        <div className="glass-card" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", border: "2px solid var(--primary, #0070f3)", background: "var(--card)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-40px", right: "-40px", opacity: 0.1, transform: "rotate(12deg)", pointerEvents: "none" }}>
            <Sparkles size={160} color="#3695e3" />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Pro <Zap size={20} color="#f2a900" fill="currentColor" />
            </h3>
            <span style={{ background: "rgba(0, 112, 243, 0.14)", color: "var(--primary, #0070f3)", padding: "0.25rem 0.75rem", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 600 }}>
              Most popular
            </span>
          </div>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            Advanced AI tools for serious candidates.
          </p>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem", marginBottom: "2rem" }}>
            <span style={{ fontSize: "3rem", fontWeight: 700, color: "var(--foreground)" }}>$9.99</span>
            <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>/month</span>
          </div>
          {isPro ? (
            <Button
              variant="outline"
              disabled
              style={{ width: "100%", marginBottom: "2rem" }}
            >
              Current Plan
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubscribe}
              disabled={isLoading}
              style={{ width: "100%", marginBottom: "2rem" }}
            >
              {isLoading ? <Loader2 className="animate-spin" size={18} /> : "Upgrade to Pro"}
            </Button>
          )}
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "1rem", padding: 0, color: "var(--foreground)" }}>
            {[
              "Unlimited job discoveries",
              "Advanced AI Opportunity Scoring",
              "Automated Resume Tailoring",
              "Custom Cover Letter Generation",
              "Interview Prep & Insights",
              "Priority Support"
            ].map((feature) => (
              <li key={feature} style={{ display: "flex", gap: "0.75rem", color: "var(--foreground)", fontSize: "0.95rem", fontWeight: 500 }}>
                <Check size={20} color="#3695e3" style={{ flexShrink: 0 }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Organization Plan */}
        <div className="glass-card" style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", background: "var(--card)", border: "1px solid var(--border)", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              Organization <Building2 size={20} color="#8b5cf6" />
            </h3>
            <span style={{ background: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6", padding: "0.25rem 0.75rem", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 600 }}>
              Teams & Orgs
            </span>
          </div>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            Multi-seat passes for businesses, career centers & agencies.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Starting at</span>
              <span style={{ fontSize: "2.5rem", fontWeight: 700, color: "var(--foreground)", lineHeight: 1 }}>$6.99</span>
              <span style={{ color: "var(--muted-foreground)", fontWeight: 600, fontSize: "0.95rem" }}>/ seat / month</span>
            </div>
            <span style={{ color: "var(--muted-foreground)", fontSize: "0.8rem", fontWeight: 500 }}>Volume discounts up to 30% off · 1-mo, 3-mo, 6-mo &amp; 1-yr passes</span>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (isOrgUser) {
                router.push("/org-admin");
              } else {
                window.location.href = "mailto:support@jobagenthq.com?subject=Organization%20Account%20Inquiry";
              }
            }}
            style={{ width: "100%", marginBottom: "2rem" }}
          >
            {isOrgUser ? "Manage Org Passes" : "Contact Sales / Buy Passes"}
          </Button>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "1rem", padding: 0, margin: "0 0 1.25rem 0", color: "var(--foreground)" }}>
            {[
              "Multi-seat pass management dashboard",
              "Batch candidate & student email invitations",
              "30-day (or custom) access per activated pass",
              "Full Pro features for all assigned members",
              "Centralized activity logs & seat usage metrics"
            ].map((feature) => (
              <li key={feature} style={{ display: "flex", gap: "0.75rem", color: "var(--foreground)", fontSize: "0.95rem", fontWeight: 500 }}>
                <Check size={20} color="#8b5cf6" style={{ flexShrink: 0 }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <p style={{ color: "var(--muted-foreground)", fontSize: "0.75rem", margin: 0, fontStyle: "italic", borderTop: "1px solid var(--border)", paddingTop: "0.75rem", lineHeight: 1.4 }}>
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
