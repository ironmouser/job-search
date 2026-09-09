"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Users, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

function JoinTeamContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!token) {
      setError("No invitation token was provided.");
      setLoading(false);
      return;
    }

    fetch(`/api/recruiter/team/join?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          setError(data.error || "Failed to validate invitation.");
        } else {
          setInvitation(data.invitation);
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load invitation.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setError(null);

    try {
      const res = await fetch("/api/recruiter/team/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName,
          lastName,
          title,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept team invitation.");
      }

      router.push("/recruiter");
    } catch (err: any) {
      setError(err.message);
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>
        Validating team invitation...
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "520px",
        margin: "4rem auto",
        padding: "2rem",
        borderRadius: "16px",
        background: "var(--card)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-lg)",
        color: "var(--card-foreground)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            background: "rgba(54, 149, 227, 0.15)",
            border: "1px solid rgba(54, 149, 227, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1rem auto",
            color: "#3695e3",
          }}
        >
          <Users size={26} />
        </div>

        <h2 style={{ fontSize: "1.45rem", fontWeight: 700, margin: "0 0 0.4rem 0", color: "var(--foreground)" }}>
          Join {invitation?.organizationName || "Team"}
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", margin: 0 }}>
          {invitation?.inviterName} has invited you to join as a{" "}
          <strong style={{ color: "#3695e3" }}>{invitation?.role}</strong>.
        </p>
      </div>

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
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {invitation && (
        <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
              Work Email
            </label>
            <input
              type="text"
              disabled
              value={invitation.email}
              style={{
                width: "100%",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                background: "var(--input)",
                border: "1px solid var(--input-border)",
                color: "var(--muted-foreground)",
                fontSize: "0.88rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                First Name *
              </label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Alex"
                style={{
                  width: "100%",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "8px",
                  background: "var(--input)",
                  border: "1px solid var(--input-border)",
                  color: "var(--foreground)",
                  fontSize: "0.88rem",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Last Name *
              </label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Morgan"
                style={{
                  width: "100%",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "8px",
                  background: "var(--input)",
                  border: "1px solid var(--input-border)",
                  color: "var(--foreground)",
                  fontSize: "0.88rem",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
              Professional Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Senior Technical Recruiter"
              style={{
                width: "100%",
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                background: "var(--input)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                fontSize: "0.88rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={joining}
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #3695e3, #2563eb)",
              border: "none",
              color: "#ffffff",
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: joining ? "not-allowed" : "pointer",
              opacity: joining ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span>{joining ? "Joining Team..." : "Accept Invitation & Enter Portal"}</span>
            <ArrowRight size={16} />
          </button>
        </form>
      )}
    </div>
  );
}

export default function JoinTeamPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "4rem" }}>Loading...</div>}>
      <JoinTeamContent />
    </Suspense>
  );
}
