"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, Zap } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!session) {
      router.push("/login");
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

  return (
    <div className="animate-fade-in" style={{ padding: "4rem 2rem", minHeight: "100vh", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center" }}>
      
      <div style={{ textAlign: "center", marginBottom: "4rem", position: "relative", zIndex: 10 }}>
        <h2 className="page-title" style={{ fontSize: "1.25rem", color: "#3695e3", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          Pricing
        </h2>
        <p style={{ fontSize: "3rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: "1rem" }}>
          Supercharge your job search
        </p>
        <p className="page-subtitle" style={{ fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
          Choose the right plan to get AI-powered insights, automated resume tailoring, and advanced market analysis.
        </p>
      </div>

      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", justifyContent: "center", position: "relative", zIndex: 10, maxWidth: "1000px", width: "100%" }}>
        
        {/* Free Tier */}
        <div className="glass-card" style={{ flex: "1 1 350px", display: "flex", flexDirection: "column" }}>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
            Starter
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "1.5rem" }}>
            Perfect for casual job seekers looking for basic insights.
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
            {["Basic resume parsing", "Up to 10 job discoveries per month", "Standard opportunity scoring", "Community support"].map((feature) => (
              <li key={feature} style={{ display: "flex", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                <Check size={20} color="#3695e3" style={{ flexShrink: 0 }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pro Tier */}
        <div className="glass-card" style={{ flex: "1 1 350px", display: "flex", flexDirection: "column", border: "2px solid #3695e3", background: "rgba(54, 149, 227, 0.05)", position: "relative", overflow: "hidden" }}>
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

      </div>
    </div>
  );
}
