"use client";

import { useState, useEffect } from "react";
import RecruiterHeader from "@/components/recruiter/RecruiterHeader";
import RecruiterUpgradeModal from "@/components/recruiter/RecruiterUpgradeModal";
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users,
  Lock,
  Download,
  Award,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export default function RecruiterAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recruiter/analytics");
      const json = await res.json();
      if (json.success) {
        setData(json.analytics);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleExportCSV = () => {
    if (!data?.jobs) return;
    const headers = ["Job Title", "Intros Requested", "Accepted", "Hires", "Acceptance Rate %"];
    const rows = data.jobs.map((j: any) => [
      `"${j.title.replace(/"/g, '""')}"`,
      j.intros,
      j.accepted,
      j.hired,
      `${j.acceptanceRate}%`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `recruiter_analytics_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isLocked = !data?.unlocked || data?.tier === "NONE";
  const isAdvanced = data?.isAdvanced;

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem" }}>
      <RecruiterHeader
        title="Recruiter Analytics"
        subtitle="Track hiring funnel conversion, candidate response turnaround times, and team performance."
      />

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>
          Loading performance analytics...
        </div>
      ) : isLocked ? (
        /* Locked Preview State for Starter & Free Explorer */
        <div
          style={{
            padding: "3rem 2rem",
            borderRadius: "16px",
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-md)",
            textAlign: "center",
            maxWidth: "680px",
            margin: "2rem auto",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(54, 149, 227, 0.15)",
              border: "1px solid rgba(54, 149, 227, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem auto",
              color: "#3695e3",
            }}
          >
            <Lock size={26} />
          </div>

          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>
            Unlock Hiring Funnel & Team Analytics
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.92rem", margin: "0 0 1.75rem 0", lineHeight: 1.5 }}>
            Recruiting metrics, candidate acceptance rates, median response velocities, and team leaderboards
            are available on <strong>Pro</strong> and <strong>Agency</strong> plans.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
              textAlign: "left",
              marginBottom: "2rem",
              background: "var(--secondary)",
              padding: "1.25rem",
              borderRadius: "10px",
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: "#3695e3", fontSize: "0.85rem", marginBottom: "4px" }}>
                Basic Analytics (Pro)
              </div>
              <ul style={{ paddingLeft: "1.2rem", margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                <li>Introduction Funnel (Sent &rarr; Hired)</li>
                <li>Candidate Acceptance Rates</li>
                <li>Median Response Turnaround</li>
                <li>Job-Level Conversion Tracking</li>
              </ul>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "#a855f7", fontSize: "0.85rem", marginBottom: "4px" }}>
                Advanced Analytics (Agency)
              </div>
              <ul style={{ paddingLeft: "1.2rem", margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                <li>Recruiter Team Leaderboard</li>
                <li>Pipeline Velocity (Days-to-Hire)</li>
                <li>Market Candidate Fit Scoring</li>
                <li>Exportable Client Attribution CSV</li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => setIsUpgradeOpen(true)}
            style={{
              padding: "0.75rem 1.6rem",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #3695e3, #2563eb)",
              border: "none",
              color: "#ffffff",
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
            }}
          >
            <Sparkles size={16} />
            <span>Upgrade to Unlock Analytics</span>
            <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Top Metric Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1.25rem",
            }}
          >
            <div
              style={{
                padding: "1.25rem",
                borderRadius: "12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Total Introductions
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--foreground)" }}>
                {data?.funnel.requested}
              </div>
              <div style={{ fontSize: "0.78rem", color: "#3695e3", marginTop: "4px" }}>
                {data?.entitlements?.intros.remaining} quota remaining
              </div>
            </div>

            <div
              style={{
                padding: "1.25rem",
                borderRadius: "12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Candidate Acceptance Rate
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#10b981" }}>
                {data?.funnel.acceptanceRate}%
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                {data?.funnel.accepted} introductions accepted
              </div>
            </div>

            <div
              style={{
                padding: "1.25rem",
                borderRadius: "12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Median Candidate Response
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#f59e0b" }}>
                {data?.velocity.medianTurnaroundHours}h
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                From intro request to response
              </div>
            </div>

            <div
              style={{
                padding: "1.25rem",
                borderRadius: "12px",
                background: "var(--card)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                Confirmed Placements
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#ec4899" }}>
                {data?.funnel.hires}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                {data?.funnel.interviews} in interview stage
              </div>
            </div>
          </div>

          {/* Hiring Funnel Progression Card */}
          <div
            style={{
              padding: "1.5rem",
              borderRadius: "12px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 1.25rem 0", color: "var(--foreground)" }}>
              Candidate Hiring Funnel
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "1rem",
              }}
            >
              {[
                { label: "1. Requested", count: data?.funnel.requested, color: "#3695e3" },
                { label: "2. Candidate Accepted", count: data?.funnel.accepted, color: "#10b981" },
                { label: "3. In Interview", count: data?.funnel.interviews, color: "#f59e0b" },
                { label: "4. Offer Extended", count: data?.funnel.offers, color: "#8b5cf6" },
                { label: "5. Hired / Placed", count: data?.funnel.hires, color: "#ec4899" },
              ].map((stage, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "1rem",
                    borderRadius: "8px",
                    background: "var(--secondary)",
                    border: `1px solid ${stage.color}30`,
                    borderLeft: `4px solid ${stage.color}`,
                  }}
                >
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    {stage.label}
                  </div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--foreground)" }}>{stage.count}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Job Breakdown & Export Row */}
          <div
            style={{
              padding: "1.5rem",
              borderRadius: "12px",
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                Job Requisition Conversion Breakdown
              </h3>
              <button
                onClick={handleExportCSV}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Download size={14} />
                <span>Export CSV Report</span>
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-secondary)" }}>
                    <th style={{ padding: "8px 12px" }}>Job Opening</th>
                    <th style={{ padding: "8px 12px" }}>Intros Sent</th>
                    <th style={{ padding: "8px 12px" }}>Accepted</th>
                    <th style={{ padding: "8px 12px" }}>Hires</th>
                    <th style={{ padding: "8px 12px" }}>Acceptance Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.jobs?.map((j: any) => (
                    <tr key={j.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px", color: "var(--foreground)", fontWeight: 500 }}>{j.title}</td>
                      <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>{j.intros}</td>
                      <td style={{ padding: "10px 12px", color: "#10b981" }}>{j.accepted}</td>
                      <td style={{ padding: "10px 12px", color: "#ec4899" }}>{j.hired}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#3695e3" }}>
                        {j.acceptanceRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Advanced Analytics Section (Agency Only) */}
          {isAdvanced ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {/* Team Leaderboard */}
              <div
                style={{
                  padding: "1.5rem",
                  borderRadius: "12px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
                  <Award size={18} color="#a855f7" />
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                    Recruiter Team Leaderboard
                  </h3>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {data?.advanced?.teamLeaderboard?.map((rec: any) => (
                    <div
                      key={rec.id}
                      style={{
                        padding: "0.75rem 1rem",
                        borderRadius: "8px",
                        background: "var(--secondary)",
                        border: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--foreground)", fontSize: "0.9rem" }}>{rec.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{rec.email}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: "#a855f7", fontSize: "0.92rem" }}>
                          {rec.intros} Intros ({rec.acceptanceRate}%)
                        </div>
                        <div style={{ fontSize: "0.78rem", color: "#10b981" }}>{rec.hires} Hires</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pipeline Velocity Timeline */}
              <div
                style={{
                  padding: "1.5rem",
                  borderRadius: "12px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "1rem" }}>
                  <Clock size={18} color="#f59e0b" />
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                    Pipeline Velocity Metrics
                  </h3>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                      <span style={{ color: "var(--text-secondary)" }}>Days to Candidate Response</span>
                      <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                        {data?.advanced?.velocityDays?.firstResponse} days
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                      <span style={{ color: "var(--text-secondary)" }}>Days from Intro to Interview</span>
                      <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                        {data?.advanced?.velocityDays?.toInterview} days
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                      <span style={{ color: "var(--text-secondary)" }}>Days from Intro to Confirmed Hire</span>
                      <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                        {data?.advanced?.velocityDays?.toHire} days
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.85rem",
                      borderRadius: "8px",
                      background: "rgba(54, 149, 227, 0.08)",
                      border: "1px solid rgba(54, 149, 227, 0.2)",
                    }}
                  >
                    <div style={{ fontSize: "0.82rem", color: "#3695e3", fontWeight: 600 }}>
                      Average Candidate Fit Score: {data?.advanced?.averageFitScore}%
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                      Calculated across all AI candidate match evaluations.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Pro Tier Banner Prompting Agency Upgrade */
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderRadius: "12px",
                background: "linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(37, 99, 235, 0.1))",
                border: "1px solid rgba(168, 85, 247, 0.25)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: "var(--foreground)", fontSize: "0.95rem", marginBottom: "3px" }}>
                  Unlock Advanced Agency Analytics
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                  Upgrade to Agency ($499/mo) to view team recruiter leaderboards, time-to-hire velocity, and client reports.
                </div>
              </div>
              <button
                onClick={() => setIsUpgradeOpen(true)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  background: "#a855f7",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Upgrade to Agency
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upgrade Modal */}
      <RecruiterUpgradeModal
        isOpen={isUpgradeOpen}
        onClose={() => {
          setIsUpgradeOpen(false);
          fetchAnalytics();
        }}
        organizationId={data?.entitlements?.organizationId}
      />
    </div>
  );
}
