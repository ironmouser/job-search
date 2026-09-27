"use client";

import { useState, useEffect } from "react";
import RecruiterHeader from "@/components/recruiter/RecruiterHeader";
import {
  UserCheck,
  Building2,
  Mail,
  Link2,
  Globe,
  ShieldCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Save,
  Camera,
  ExternalLink,
} from "lucide-react";

interface OrganizationInfo {
  id: string;
  name: string;
  type: string;
  website: string | null;
  description: string | null;
  logoUrl: string | null;
  verificationStatus: string;
  verifiedAt: string | null;
}

interface RecruiterProfileData {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  businessEmail: string;
  profilePhotoUrl: string | null;
  bio: string | null;
  linkedinUrl: string | null;
  role: string;
  verificationStatus: string;
  verifiedAt: string | null;
  organization: OrganizationInfo | null;
}

export default function RecruiterSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<RecruiterProfileData | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch("/api/recruiter/profile");
      const data = await res.json();

      if (res.ok && data?.hasProfile && data.profile) {
        const p: RecruiterProfileData = data.profile;
        setProfile(p);
        setFirstName(p.firstName || "");
        setLastName(p.lastName || "");
        setTitle(p.title || "");
        setBio(p.bio || "");
        setLinkedinUrl(p.linkedinUrl || "");
        setProfilePhotoUrl(p.profilePhotoUrl || "");
      } else {
        setErrorMessage(data?.error || "Unable to load recruiter profile.");
      }
    } catch (err: any) {
      console.error("Failed to load recruiter profile:", err);
      setErrorMessage("Network error while loading recruiter profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/recruiter/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          title: title.trim(),
          bio: bio.trim(),
          linkedinUrl: linkedinUrl.trim(),
          profilePhotoUrl: profilePhotoUrl.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile.");
      }

      setSuccessMessage("Your profile has been saved successfully.");
      await fetchProfile();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "VERIFIED") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            borderRadius: 9999,
            fontSize: "0.75rem",
            fontWeight: 600,
            background: "rgba(16, 185, 129, 0.15)",
            color: "#10b981",
            border: "1px solid rgba(16, 185, 129, 0.3)",
          }}
        >
          <CheckCircle2 size={13} />
          Verified
        </span>
      );
    }
    if (status === "PENDING") {
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 10px",
            borderRadius: 9999,
            fontSize: "0.75rem",
            fontWeight: 600,
            background: "rgba(245, 158, 11, 0.15)",
            color: "#f59e0b",
            border: "1px solid rgba(245, 158, 11, 0.3)",
          }}
        >
          <Clock size={13} />
          Pending Verification
        </span>
      );
    }
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 10px",
          borderRadius: 9999,
          fontSize: "0.75rem",
          fontWeight: 600,
          background: "rgba(148, 163, 184, 0.15)",
          color: "#94a3b8",
          border: "1px solid rgba(148, 163, 184, 0.3)",
        }}
      >
        <AlertCircle size={13} />
        {status}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1.5rem" }}>
      <RecruiterHeader
        title="Settings & Profile"
        subtitle="Manage your personal recruiter profile and review organization credentials."
      />

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem auto" }} />
          <p style={{ margin: 0, fontSize: "0.95rem" }}>Loading profile settings...</p>
        </div>
      ) : errorMessage && !profile ? (
        <div
          style={{
            padding: "2rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: 12,
            textAlign: "center",
            color: "#f87171",
          }}
        >
          <AlertCircle size={28} style={{ margin: "0 auto 0.5rem auto" }} />
          <p style={{ margin: "0 0 1rem 0" }}>{errorMessage}</p>
          <button
            onClick={fetchProfile}
            style={{
              padding: "0.5rem 1.25rem",
              background: "rgba(239, 68, 68, 0.2)",
              color: "#fca5a5",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Notifications */}
          {successMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0.875rem 1.25rem",
                borderRadius: 10,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#10b981",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              <CheckCircle2 size={18} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0.875rem 1.25rem",
                borderRadius: 10,
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#f87171",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Personal Recruiter Profile */}
          <div
            className="glass-card"
            style={{
              padding: "2rem",
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--card)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem",
                flexWrap: "wrap",
                gap: 12,
                borderBottom: "1px solid var(--border)",
                paddingBottom: "1rem",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <UserCheck size={20} color="#3695e3" />
                  Personal Recruiter Profile
                </h2>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Your identity shown to candidates during introduction requests.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {profile && getStatusBadge(profile.verificationStatus)}
                {profile?.role && (
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 9999,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      background: "rgba(54, 149, 227, 0.15)",
                      color: "#3695e3",
                      border: "1px solid rgba(54, 149, 227, 0.3)",
                      textTransform: "uppercase",
                    }}
                  >
                    {profile.role}
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveProfile}>
              {/* Photo Preview & URL */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  marginBottom: "1.75rem",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: "50%",
                    backgroundColor: "rgba(54, 149, 227, 0.15)",
                    border: "2px solid rgba(54, 149, 227, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#3695e3",
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {profilePhotoUrl ? (
                    <img
                      src={profilePhotoUrl}
                      alt="Profile preview"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span>
                      {(firstName[0] || "").toUpperCase()}
                      {(lastName[0] || "").toUpperCase()}
                    </span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: "260px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "0.35rem",
                    }}
                  >
                    <Camera size={14} style={{ color: "#3695e3" }} />
                    Profile Photo URL
                  </label>
                  <input
                    type="url"
                    value={profilePhotoUrl}
                    onChange={(e) => setProfilePhotoUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--input-bg, var(--background))",
                      color: "var(--foreground)",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                    }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "block" }}>
                    Provide a direct link to an image hosted online or leave blank to show your initials.
                  </span>
                </div>
              </div>

              {/* Name Fields Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "0.35rem",
                    }}
                  >
                    First Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Kurt"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--input-bg, var(--background))",
                      color: "var(--foreground)",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "0.35rem",
                    }}
                  >
                    Last Name <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Charles"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--input-bg, var(--background))",
                      color: "var(--foreground)",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Title & Email Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "0.35rem",
                    }}
                  >
                    Professional Title <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Senior Talent Partner"
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--input-bg, var(--background))",
                      color: "var(--foreground)",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      marginBottom: "0.35rem",
                    }}
                  >
                    <Mail size={14} style={{ color: "var(--text-secondary)" }} />
                    Business Email
                  </label>
                  <input
                    type="email"
                    disabled
                    value={profile?.businessEmail || ""}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "rgba(255, 255, 255, 0.04)",
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                      cursor: "not-allowed",
                      boxSizing: "border-box",
                    }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "block" }}>
                    Verified email tied to your login credentials.
                  </span>
                </div>
              </div>

              {/* LinkedIn URL */}
              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "0.35rem",
                  }}
                >
                  <Link2 size={14} style={{ color: "#0ea5e9" }} />
                  LinkedIn Profile URL
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourname"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--input-bg, var(--background))",
                    color: "var(--foreground)",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Bio */}
              <div style={{ marginBottom: "1.75rem" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "0.35rem",
                  }}
                >
                  Recruiter Bio
                </label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell candidates about your background, specializations, and the kinds of engineering opportunities you represent."
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--input-bg, var(--background))",
                    color: "var(--foreground)",
                    fontSize: "0.875rem",
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Form Action */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0.65rem 1.5rem",
                    borderRadius: 8,
                    background: "#3695e3",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: saving ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  <span>{saving ? "Saving Changes..." : "Save Profile"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Section 2: Organization Overview (Read-Only) */}
          <div
            className="glass-card"
            style={{
              padding: "2rem",
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--card)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem",
                flexWrap: "wrap",
                gap: 12,
                borderBottom: "1px solid var(--border)",
                paddingBottom: "1rem",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Building2 size={20} color="#8b5cf6" />
                  Organization Credentials
                </h2>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Verified company information attached to all job openings and introduction inquiries.
                </p>
              </div>

              {profile?.organization && getStatusBadge(profile.organization.verificationStatus)}
            </div>

            {profile?.organization ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "1.25rem",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700 }}>
                      Company Name
                    </span>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {profile.organization.name}
                    </p>
                  </div>

                  <div>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700 }}>
                      Organization Type
                    </span>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.95rem", color: "var(--text-primary)" }}>
                      {profile.organization.type === "IN_HOUSE" ? "In-House Talent Team" : "Recruiting & Staffing Agency"}
                    </p>
                  </div>

                  {profile.organization.website && (
                    <div>
                      <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700 }}>
                        Website
                      </span>
                      <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
                        <a
                          href={profile.organization.website.startsWith("http") ? profile.organization.website : `https://${profile.organization.website}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            color: "#3695e3",
                            textDecoration: "none",
                            fontWeight: 500,
                          }}
                        >
                          <Globe size={14} />
                          <span>{profile.organization.website}</span>
                          <ExternalLink size={12} />
                        </a>
                      </p>
                    </div>
                  )}
                </div>

                {profile.organization.description && (
                  <div>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-secondary)", fontWeight: 700 }}>
                      About Organization
                    </span>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {profile.organization.description}
                    </p>
                  </div>
                )}

                <div
                  style={{
                    marginTop: "0.5rem",
                    padding: "0.875rem 1rem",
                    borderRadius: 8,
                    background: "rgba(54, 149, 227, 0.06)",
                    border: "1px solid rgba(54, 149, 227, 0.15)",
                    fontSize: "0.825rem",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <ShieldCheck size={16} color="#3695e3" style={{ flexShrink: 0 }} />
                  <span>
                    To modify organization credentials, transfer ownership, or manage invited team members, visit the Team or Billing tabs in your portal.
                  </span>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>
                No organization linked to this recruiter profile.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
