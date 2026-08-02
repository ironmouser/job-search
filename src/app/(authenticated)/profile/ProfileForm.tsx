"use client";

import { useState, useEffect } from "react";
import {
  User,
  Image as ImageIcon,
  CreditCard,
  Save,
  Shield,
  Key,
  Sparkles,
  Info,
  CheckCircle2,
  Phone,
  MapPin,
  Globe,
  Link as LinkIcon,
  FileText,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createPortal } from "react-dom";
import Cropper from "react-easy-crop";
import { UserAvatar } from "@/components/common/UserAvatar";

interface ProfileFormProps {
  initialName: string;
  initialImage: string;
  planTier: string;
  stripeCustomerId: string | null;
  email: string | null;
}

const createImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new globalThis.Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { width: number; height: number; x: number; y: number }
): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  canvas.width = 512;
  canvas.height = 512;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    512,
    512
  );

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      "image/jpeg",
      0.8
    );
  });
}

export default function ProfileForm({
  initialName,
  initialImage,
  planTier,
  stripeCustomerId,
  email,
}: ProfileFormProps) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [name, setName] = useState(initialName);
  const [image, setImage] = useState(initialImage);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractSuccess, setExtractSuccess] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [settings, setSettings] = useState<any>({});
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setSettings(data || {});
        setLoadingSettings(false);
      })
      .catch(() => setLoadingSettings(false));
  }, []);

  const handleSettingsChange = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Cropper state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  useEffect(() => {
    if (session && (session.user as any)?.planTier !== planTier) {
      update({ planTier });
    }
  }, [session, planTier, update]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/gif"].includes(file.type)) {
      alert("Only JPEG, PNG, and GIF images are allowed.");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
    
    e.target.value = '';
  };

  const handleConfirmCrop = async () => {
    if (!cropImageSrc || !croppedAreaPixels || !selectedFile) return;

    setSaving(true);
    try {
      const croppedBlob = await getCroppedImg(cropImageSrc, croppedAreaPixels);
      if (!croppedBlob) throw new Error("Could not crop image");

      if (croppedBlob.size > 512 * 1024) {
        alert("Image is too large even after compression.");
        return;
      }

      const formData = new FormData();
      formData.append("file", croppedBlob, selectedFile.name);

      const res = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setImage(data.url);
      update({ image: data.url });

      setCropImageSrc(null);
      setSelectedFile(null);
    } catch (err) {
      alert("Failed to upload avatar");
    } finally {
      setSaving(false);
    }
  };

  const handleExtractFromResume = async () => {
    setExtracting(true);
    setExtractSuccess(false);
    try {
      const res = await fetch('/api/user/extract-from-resume', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract resume data');

      if (data.name) setName(data.name);
      if (data.phone) handleSettingsChange('phone', data.phone);
      if (data.location) handleSettingsChange('location', data.location);
      if (data.linkedinUrl) handleSettingsChange('linkedinUrl', data.linkedinUrl);
      if (data.githubUrl) handleSettingsChange('githubUrl', data.githubUrl);
      if (data.websiteUrl) handleSettingsChange('websiteUrl', data.websiteUrl);

      setExtractSuccess(true);
      setTimeout(() => setExtractSuccess(false), 5000);
    } catch (e: any) {
      alert(e.message || 'Could not extract info from resume.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, image }),
      });

      if (!res.ok) throw new Error("Failed to save profile");

      if (settings) {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });
      }

      alert("Profile and auto-apply settings updated successfully!");
      update({ image, name });
      router.refresh();
    } catch (e) {
      alert("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleManageBilling = async () => {
    setRedirecting(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No URL returned");
      }
    } catch (e) {
      alert("Failed to open billing portal. Please try again.");
      setRedirecting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {mounted && cropImageSrc && createPortal(
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: "100%",
              maxWidth: "500px",
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "16px",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div style={{ position: "relative", width: "100%", height: "360px", backgroundColor: "#0f172a" }}>
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                onZoomChange={setZoom}
              />
            </div>
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem", backgroundColor: "#ffffff" }}>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ width: "100%", cursor: "pointer" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setCropImageSrc(null)}
                  disabled={saving}
                  style={{
                    padding: "0.6rem 1.1rem",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    backgroundColor: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #e2e8f0",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCrop}
                  disabled={saving}
                  style={{
                    padding: "0.6rem 1.25rem",
                    borderRadius: "8px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    backgroundColor: saving ? "#93c5fd" : "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    cursor: saving ? "wait" : "pointer",
                  }}
                >
                  {saving ? "Uploading..." : "Confirm & Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── My Info & Auto-Fill Information Section ───────────────────────────── */}
      <div className="glass-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
              <User size={20} className="text-accent" /> My Info & Auto-Fill Settings
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0.25rem 0 0 0" }}>
              Your contact details used to automatically complete job applications.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExtractFromResume}
            disabled={extracting}
            className="btn-outline"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", padding: "0.5rem 0.9rem" }}
          >
            {extracting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Extracting...
              </>
            ) : (
              <>
                <Sparkles size={14} className="text-accent" /> Auto-Fill from Resume
              </>
            )}
          </button>
        </div>

        {/* Informational Banner */}
        <div
          style={{
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            padding: "0.85rem 1rem",
            borderRadius: "10px",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
            marginBottom: "1.5rem",
          }}
        >
          <Info size={18} style={{ color: "#3b82f6", flexShrink: 0, marginTop: "2px" }} />
          <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-primary)", lineHeight: 1.45 }}>
            <strong>Auto Apply Notice:</strong> The contact details in this section are saved securely and injected directly into application forms (Workday, Greenhouse, Lever, Ashby, Workable, etc.) when running Auto Apply on your behalf.
          </p>
        </div>

        {extractSuccess && (
          <div
            style={{
              background: "rgba(34, 197, 94, 0.1)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1.5rem",
              fontSize: "0.85rem",
              color: "#22c55e",
            }}
          >
            <CheckCircle2 size={16} /> Successfully extracted contact information from your resume! Review and click Save.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Row 1: Display Name & Email */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-glass)",
                  color: "var(--text-primary)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Email Address</label>
              <input
                type="text"
                value={email || ""}
                disabled
                style={{
                  background: "rgba(0,0,0,0.1)",
                  border: "1px solid var(--border-glass)",
                  color: "var(--text-secondary)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  cursor: "not-allowed",
                }}
              />
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Shield size={12} /> Managed via Passwordless Login
              </span>
            </div>
          </div>

          {/* Row 2: Phone Number & Location */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Phone size={14} className="text-accent" /> Phone Number
              </label>
              <input
                type="tel"
                value={settings.phone || ''}
                onChange={(e) => handleSettingsChange('phone', e.target.value)}
                placeholder='e.g. "+1 (555) 019-2834"'
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-glass)",
                  color: "var(--text-primary)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <MapPin size={14} className="text-accent" /> Location (City, State)
              </label>
              <input
                type="text"
                value={settings.location || ''}
                onChange={(e) => handleSettingsChange('location', e.target.value)}
                placeholder='e.g. "San Francisco, CA"'
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-glass)",
                  color: "var(--text-primary)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                }}
              />
            </div>
          </div>

          {/* Row 3: LinkedIn, GitHub, Website URLs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <LinkIcon size={14} className="text-accent" /> LinkedIn Profile URL
              </label>
              <input
                type="url"
                value={settings.linkedinUrl || ''}
                onChange={(e) => handleSettingsChange('linkedinUrl', e.target.value)}
                placeholder='https://linkedin.com/in/janedoe'
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-glass)",
                  color: "var(--text-primary)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <LinkIcon size={14} className="text-accent" /> GitHub URL
              </label>
              <input
                type="url"
                value={settings.githubUrl || ''}
                onChange={(e) => handleSettingsChange('githubUrl', e.target.value)}
                placeholder='https://github.com/janedoe'
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-glass)",
                  color: "var(--text-primary)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Globe size={14} className="text-accent" /> Portfolio / Personal Website
              </label>
              <input
                type="url"
                value={settings.websiteUrl || ''}
                onChange={(e) => handleSettingsChange('websiteUrl', e.target.value)}
                placeholder='https://janedoe.com'
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-glass)",
                  color: "var(--text-primary)",
                  padding: "0.75rem",
                  borderRadius: "8px",
                }}
              />
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "fit-content", marginTop: "0.5rem" }}
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save My Info"}
          </button>
        </div>
      </div>

      {/* ── Authorization & Demographics Section ─────────────────────────────── */}
      <div className="glass-card">
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <Key size={20} className="text-accent" /> Authorization & Demographics
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
          Required for Auto Applying. These settings are injected into application questionnaires (work authorization, visa sponsorship, and voluntary EEOC self-identification).
        </p>

        {loadingSettings ? (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Loading authorization settings...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.25rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>US Work Authorization</label>
                <select 
                  value={settings.usWorkAuthorization || ''}
                  onChange={(e) => handleSettingsChange('usWorkAuthorization', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes, I am authorized to work in the US</option>
                  <option value="No">No, I am not authorized</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Visa Sponsorship Required</label>
                <select 
                  value={settings.visaSponsorship || ''}
                  onChange={(e) => handleSettingsChange('visaSponsorship', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes, I require sponsorship now or in the future</option>
                  <option value="No">No, I do not require sponsorship</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.25rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Working Remotely From</label>
                <input 
                  type="text"
                  value={settings.workingRemotelyFrom || ''}
                  onChange={(e) => handleSettingsChange('workingRemotelyFrom', e.target.value)}
                  placeholder='e.g. "New York, NY", "California"'
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Country</label>
                <input 
                  type="text"
                  value={settings.country || ''}
                  onChange={(e) => handleSettingsChange('country', e.target.value)}
                  placeholder='e.g. "United States"'
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                />
              </div>
            </div>

            <div style={{ height: "1px", background: "var(--border-glass)", margin: "0.5rem 0" }} />
            <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Voluntary Self-ID (EEOC)</h4>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.25rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Gender</label>
                <select 
                  value={settings.eeocGender || ''}
                  onChange={(e) => handleSettingsChange('eeocGender', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Decline">Decline to Self-Identify</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Race/Ethnicity</label>
                <select 
                  value={settings.eeocRace || ''}
                  onChange={(e) => handleSettingsChange('eeocRace', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Hispanic or Latino">Hispanic or Latino</option>
                  <option value="White">White</option>
                  <option value="Black or African American">Black or African American</option>
                  <option value="Asian">Asian</option>
                  <option value="Native Hawaiian or Other Pacific Islander">Native Hawaiian or Other Pacific Islander</option>
                  <option value="American Indian or Alaska Native">American Indian or Alaska Native</option>
                  <option value="Two or More Races">Two or More Races</option>
                  <option value="Decline">Decline to Self-Identify</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Veteran Status</label>
                <select 
                  value={settings.eeocVeteran || ''}
                  onChange={(e) => handleSettingsChange('eeocVeteran', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">I identify as one or more of the classifications of protected veteran</option>
                  <option value="No">I am not a protected veteran</option>
                  <option value="Decline">Decline to Self-Identify</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Disability Status</label>
                <select 
                  value={settings.eeocDisability || ''}
                  onChange={(e) => handleSettingsChange('eeocDisability', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes, I have a disability (or previously had one)</option>
                  <option value="No">No, I don't have a disability</option>
                  <option value="Decline">Decline to Self-Identify</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "fit-content", marginTop: "0.5rem" }}
            >
              <Save size={18} />
              {saving ? "Saving..." : "Save Authorization & Demographics"}
            </button>
          </div>
        )}
      </div>

      {/* ── Profile Avatar & Display Name Section ──────────────────────────────── */}
      <div className="glass-card">
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <ImageIcon size={20} className="text-accent" /> Profile Avatar & Display Settings
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Profile Photo</label>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <UserAvatar
                  src={image}
                  name={name}
                  email={email}
                  size={48}
                  showIconFallback={true}
                />
              </div>
              
              <div style={{ display: "flex", gap: "0.5rem", flex: 1, alignItems: "center" }}>
                <label className="btn-outline" style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer", margin: 0 }}>
                  Upload Image
                  <input type="file" accept="image/jpeg, image/png, image/gif" style={{ display: "none" }} onChange={handleFileChange} />
                </label>
                
                <span style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0 0.5rem" }}>OR</span>

                <input
                  type="text"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://example.com/my-photo.jpg"
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--border-glass)",
                    color: "var(--text-primary)",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    flex: 1,
                    minWidth: "200px"
                  }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="btn-primary"
            style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "fit-content", marginTop: "0.5rem" }}
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Photo Settings"}
          </button>
        </div>
      </div>

      {/* ── Subscription Section ────────────────────────────────────────────── */}
      <div className="glass-card">
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <CreditCard size={20} className="text-accent" /> Subscription
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid var(--border-glass)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Current Plan</span>
              <span style={{ fontSize: "1.25rem", fontWeight: 600, color: planTier === "PRO" ? "var(--accent-primary)" : "var(--text-primary)" }}>
                {planTier === "PRO" ? "Job Agent HQ Pro" : "Free Plan"}
              </span>
            </div>
            {stripeCustomerId ? (
              <button
                onClick={handleManageBilling}
                disabled={redirecting}
                className="btn-outline"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                {redirecting ? "Opening Portal..." : "Manage Billing"}
              </button>
            ) : (
              <button
                onClick={() => router.push("/pricing")}
                className="btn-primary"
              >
                Upgrade to Pro
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
