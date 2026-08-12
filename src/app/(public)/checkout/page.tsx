"use client";

import { signIn, useSession } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2, ArrowRight, ShieldCheck, Zap, Check } from "lucide-react";
import { getAssetUrl } from "@/lib/assets";

function CheckoutAuthContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isVerifyView, setIsVerifyView] = useState(false);

  useEffect(() => {
    // If the user is already authenticated, automatically proceed to Stripe checkout
    if (status === "authenticated" && session) {
      window.location.href = "/api/stripe/checkout";
    }
  }, [status, session]);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await signIn("email", {
        email,
        callbackUrl: "/api/stripe/checkout",
        redirect: false,
      });
      if (res?.error) {
        alert(`Authentication error: ${res.error}`);
      } else {
        setIsVerifyView(true);
      }
    } catch (error) {
      console.error("Sign in error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/api/stripe/checkout" });
    } catch (error) {
      console.error("Google sign in error:", error);
      setIsGoogleLoading(false);
    }
  };

  if (status === "loading" || status === "authenticated") {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#D2DCE3" }}>
        <Loader2 className="animate-spin" size={36} color="#2563eb" />
        <p style={{ marginTop: "1rem", color: "#1e293b", fontWeight: 600 }}>
          {status === "authenticated" ? "Redirecting to payment checkout..." : "Loading checkout..."}
        </p>
      </div>
    );
  }

  return (
    <div
      className="animate-fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        position: "relative",
        padding: "2rem 1rem",
        backgroundColor: "#D2DCE3",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          maxWidth: "480px",
        }}
      >
        {/* Header Branding */}
        <div style={{ zIndex: 10, textAlign: "center", marginBottom: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img
            src={getAssetUrl("/full-logo.png")}
            alt="Job Agent HQ"
            style={{ height: "140px", width: "auto", display: "block", marginBottom: "0.5rem" }}
          />
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "rgba(37, 99, 235, 0.15)",
              color: "#2563eb",
              border: "1px solid rgba(37, 99, 235, 0.3)",
              padding: "0.35rem 0.85rem",
              borderRadius: "99px",
              fontSize: "0.85rem",
              fontWeight: 700,
              marginBottom: "0.75rem",
            }}
          >
            <Zap size={14} fill="currentColor" />
            Job Agent HQ Pro — $20/month
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0f172a", margin: "0 0 0.5rem 0" }}>
            Get Started with Pro
          </h1>
          <p style={{ color: "#334155", fontSize: "0.95rem", margin: 0, lineHeight: 1.4, maxWidth: "420px" }}>
            Sign in or create an account below to complete your purchase. Your payment will be processed securely on the next step.
          </p>
        </div>

        {/* Feature Pill Card */}
        <div
          style={{
            width: "100%",
            background: "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255, 255, 255, 0.9)",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Included with Pro:
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            {[
              "Unlimited AI scoring",
              "Tailored resumes",
              "Cover letter generator",
              "Hands-free auto apply",
            ].map((feature) => (
              <li key={feature} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "#1e293b", fontWeight: 600 }}>
                <Check size={14} color="#10b981" style={{ flexShrink: 0 }} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Auth Card */}
        <div className="glass-card" style={{ width: "100%", position: "relative", zIndex: 10, background: "#ffffff", borderRadius: "16px", padding: "1.75rem", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}>
          {isVerifyView ? (
            <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease" }}>
              <div style={{ margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center", width: "64px", height: "64px", borderRadius: "50%", background: "rgba(37, 99, 235, 0.15)" }}>
                <Mail size={32} color="#2563eb" />
              </div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0f172a", marginBottom: "0.5rem" }}>Check your email</h3>
              <p style={{ color: "#475569", fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
                A sign-in link has been sent to your email address. Click the link to complete authentication and proceed directly to payment.
              </p>
              <button
                onClick={() => setIsVerifyView(false)}
                style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}
              >
                &larr; Back to login
              </button>
            </div>
          ) : (
            <div>
              <button
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="btn-outline"
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: "#0f172a",
                  borderColor: "#cbd5e1",
                  background: "#f8fafc",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                {isGoogleLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Continue with Google
              </button>

              <div style={{ margin: "1.25rem 0", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
                  <div style={{ width: "100%", borderTop: "1px solid #e2e8f0" }} />
                </div>
                <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                  <span style={{ background: "#ffffff", padding: "0 0.5rem", color: "#64748b", fontSize: "0.8rem", fontWeight: 500 }}>
                    Or sign in with email
                  </span>
                </div>
              </div>

              <form onSubmit={handleEmailSignIn} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label htmlFor="email" style={{ fontSize: "0.85rem", color: "#334155", fontWeight: 600 }}>
                    Email address
                  </label>
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <div style={{ position: "absolute", left: "12px", display: "flex", pointerEvents: "none" }}>
                      <Mail size={18} color="#64748b" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.75rem 0.75rem 0.75rem 2.5rem",
                        background: "#f8fafc",
                        border: "1px solid #cbd5e1",
                        color: "#0f172a",
                        borderRadius: "8px",
                        fontSize: "0.95rem",
                      }}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-primary"
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "#2563eb",
                    color: "#ffffff",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    cursor: "pointer",
                    border: "none",
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Sending Magic Link...
                    </>
                  ) : (
                    <>
                      Continue to Payment
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.4rem", color: "#64748b", fontSize: "0.8rem" }}>
                <ShieldCheck size={14} color="#10b981" />
                <span>Secure passwordless sign in — instant redirect to checkout</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CheckoutAuthPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Loader2 className="animate-spin" size={32} color="#2563eb" /></div>}>
      <CheckoutAuthContent />
    </Suspense>
  );
}
