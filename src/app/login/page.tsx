"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Loader2, ArrowRight, ShieldCheck } from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isVerifyView, setIsVerifyView] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams?.get("verify") === "true") {
      setIsVerifyView(true);
    }
  }, [searchParams]);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await signIn("email", { 
        email, 
        callbackUrl: "/onboarding",
        redirect: false 
      });
      setIsVerifyView(true);
    } catch (error) {
      console.error("Sign in error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/onboarding" });
    } catch (error) {
      console.error("Google sign in error:", error);
      setIsGoogleLoading(false);
    }
  };

  const handleTestSignIn = async () => {
    try {
      await signIn("credentials", { callbackUrl: "/" });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", position: "relative", overflow: "hidden", padding: "2rem" }}>
      
      <div style={{ zIndex: 10, textAlign: "center", marginBottom: "2rem" }}>
        <h2 className="page-title" style={{ fontSize: "2.5rem", color: "#fff" }}>
          Job Agent HQ
        </h2>
        <p className="page-subtitle" style={{ marginTop: "0.5rem" }}>
          Sign in to your account or create a new one
        </p>
      </div>

      <div className="glass-card" style={{ width: "100%", maxWidth: "420px", position: "relative", zIndex: 10 }}>
        {isVerifyView ? (
          <div style={{ textAlign: "center", animation: "fadeIn 0.5s ease" }}>
            <div style={{ margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center", width: "64px", height: "64px", borderRadius: "50%", background: "rgba(54, 149, 227, 0.15)" }}>
              <Mail size={32} color="#3695e3" />
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#fff", marginBottom: "0.5rem" }}>Check your email</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              A sign in link has been sent to your email address. Click the link to securely sign in.
            </p>
            <button
              onClick={() => setIsVerifyView(false)}
              style={{ background: "none", border: "none", color: "#3695e3", cursor: "pointer", fontSize: "0.9rem", fontWeight: 500 }}
            >
              &larr; Back to login
            </button>
          </div>
        ) : (
          <div>
            <form onSubmit={handleEmailSignIn} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <label htmlFor="email" style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                  Email address
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <div style={{ position: "absolute", left: "12px", display: "flex", pointerEvents: "none" }}>
                    <Mail size={18} color="var(--text-secondary)" />
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
                      background: "rgba(0,0,0,0.2)",
                      border: "1px solid var(--border-glass)",
                      color: "var(--text-primary)",
                      borderRadius: "8px"
                    }}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
                style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Sending Link...
                  </>
                ) : (
                  <>
                    Continue with Email
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            <div style={{ marginTop: "2rem", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
                <div style={{ width: "100%", borderTop: "1px solid var(--border-glass)" }} />
              </div>
              <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                <span style={{ background: "var(--bg-glass)", padding: "0 0.5rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>Or continue with</span>
              </div>
            </div>

            <div style={{ marginTop: "2rem" }}>
              <button
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="btn-outline"
                style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", borderColor: "var(--border-glass)" }}
              >
                {isGoogleLoading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Google
              </button>
              <button
                onClick={handleTestSignIn}
                className="btn-outline"
                style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", borderColor: "var(--border-glass)", marginTop: '1rem' }}
              >
                Test Login
              </button>
            </div>

            <div style={{ marginTop: "2rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
              <ShieldCheck size={14} />
              <span>Secure, passwordless authentication</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Loader2 className="animate-spin" size={32} color="#3695e3" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
