"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  Target,
  Upload,
  Clipboard,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Zap,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  AlertCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  const [parsingResume, setParsingResume] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Accordion state
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'personal-info': false,
    'work-auth': false,
    'target-profile': false,
    'base-resume': false,
    'avatar-settings': false,
    subscription: false,
  });

  const toggleSection = (id: string, forceState?: boolean) => {
    setOpenSections((prev) => {
      const nextState = forceState !== undefined ? forceState : !prev[id];
      return { ...prev, [id]: nextState };
    });
  };

  const handleDockNav = (id: string) => {
    toggleSection(id, true);
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  };

  const allExpanded = Object.values(openSections).every(Boolean);

  const toggleAllSections = () => {
    const nextState = !allExpanded;
    setOpenSections({
      'personal-info': nextState,
      'work-auth': nextState,
      'target-profile': nextState,
      'base-resume': nextState,
      'avatar-settings': nextState,
      subscription: nextState,
    });
  };

  const [settings, setSettings] = useState<any>({});
  const [loadingSettings, setLoadingSettings] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Smooth scroll to hash anchor on load (e.g., #target-profile or #base-resume)
  useEffect(() => {
    if (!loadingSettings && typeof window !== 'undefined' && window.location.hash) {
      const targetId = window.location.hash.replace('#', '');
      const el = document.getElementById(targetId);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      }
    }
  }, [loadingSettings]);

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
      if (data.streetAddress) handleSettingsChange('streetAddress', data.streetAddress);
      if (data.city) handleSettingsChange('city', data.city);
      if (data.state) handleSettingsChange('state', data.state);
      if (data.postalCode) handleSettingsChange('postalCode', data.postalCode);
      if (data.country) handleSettingsChange('country', data.country);
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

  const handleResumeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingResume(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.markdown) {
        handleSettingsChange('resumeMarkdown', data.markdown);
        alert('Resume parsed and imported into editor! Click "Save Changes" to apply.');
      } else {
        throw new Error(data.error || 'Failed to parse resume');
      }
    } catch (err: any) {
      alert(err.message || 'Error parsing file.');
    } finally {
      setParsingResume(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePasteResume = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleSettingsChange('resumeMarkdown', text);
      }
    } catch (err) {
      alert('Could not read from clipboard. Please ensure you have granted permission, or manually paste into the text area.');
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, image }),
      });

      if (!res.ok) throw new Error("Failed to save profile");

      if (settings) {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });

        // Also save base assets (resumeMarkdown & profile)
        await fetch('/api/assets/base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: settings.resumeMarkdown || '',
            profile: settings.profile || '',
          }),
        });
      }

      alert("Profile, target profile, and base resume saved successfully!");
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

      {/* Top Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your personal information, auto-apply settings, target profile, and base resume.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={toggleAllSections}
            className="btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '9999px', fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            {allExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
          </button>
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {/* -- 1. My Info & Auto-Fill Information Section ----------------------------- */}
      <div className={`glass-card accordion-card ${openSections['personal-info'] ? 'open' : ''}`} id="personal-info" style={{ padding: '1.5rem 2rem' }}>
        <div className="accordion-card-header" onClick={() => toggleSection('personal-info')}>
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
              <User size={20} className="text-accent" /> My Info & Auto-Fill Settings
            </h3>
          </div>
          <ChevronDown size={20} className="accordion-chevron" />
        </div>

        {!openSections['personal-info'] && (
          <div className="accordion-summary-box" onClick={() => toggleSection('personal-info')}>
            Contact details (name, email, phone, location, LinkedIn, GitHub, portfolio) used for automatic job applications. Click to view or edit.
          </div>
        )}

        {openSections['personal-info'] && (
          <div className="accordion-body">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
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
            <strong>Auto Apply Notice:</strong> The contact details in this section are saved securely and injected directly into application forms (Workday, Greenhouse, Lever, Ashby, Workable, etc.) when running Auto Apply on your behalf. We do not sell or share your information with any 3rd party companies.
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

          {/* Row 2: Phone Number & Street Address */}
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
                <MapPin size={14} className="text-accent" /> Street Address
              </label>
              <input
                type="text"
                value={settings.streetAddress || ''}
                onChange={(e) => handleSettingsChange('streetAddress', e.target.value)}
                placeholder='e.g. "123 Main Street, Apt 4B"'
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

          {/* Row 3: City, State / Province, ZIP / Postal Code, Country */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1.25rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>City</label>
              <input
                type="text"
                value={settings.city || ''}
                onChange={(e) => {
                  const newCity = e.target.value;
                  handleSettingsChange('city', newCity);
                  const stateVal = settings.state || '';
                  if (newCity || stateVal) {
                    handleSettingsChange('location', [newCity, stateVal].filter(Boolean).join(', '));
                  }
                }}
                placeholder='e.g. "San Francisco"'
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
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>State / Province</label>
              <input
                type="text"
                value={settings.state || ''}
                onChange={(e) => {
                  const newState = e.target.value;
                  handleSettingsChange('state', newState);
                  const cityVal = settings.city || '';
                  if (cityVal || newState) {
                    handleSettingsChange('location', [cityVal, newState].filter(Boolean).join(', '));
                  }
                }}
                placeholder='e.g. "CA"'
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
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>ZIP / Postal Code</label>
              <input
                type="text"
                value={settings.postalCode || ''}
                onChange={(e) => handleSettingsChange('postalCode', e.target.value)}
                placeholder='e.g. "94105"'
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
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Country</label>
              <input
                type="text"
                value={settings.country || ''}
                onChange={(e) => handleSettingsChange('country', e.target.value)}
                placeholder='e.g. "United States"'
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
        </div>
      </div>
      )}
      </div>

      {/* -- 2. Authorization & Demographics Section ------------------------------- */}
      <div className={`glass-card accordion-card ${openSections['work-auth'] ? 'open' : ''}`} id="work-auth" style={{ padding: '1.5rem 2rem' }}>
        <div className="accordion-card-header" onClick={() => toggleSection('work-auth')}>
          <div>
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
              <Key size={20} className="text-accent" /> Authorization & Demographics
            </h3>
          </div>
          <ChevronDown size={20} className="accordion-chevron" />
        </div>

        {!openSections['work-auth'] && (
          <div className="accordion-summary-box" onClick={() => toggleSection('work-auth')}>
            Required for Auto Applying. Work authorization, visa sponsorship, and voluntary EEOC self-identification injected into application questionnaires. Click to configure.
          </div>
        )}

        {openSections['work-auth'] && (
          <div className="accordion-body">

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

            {/* Row: Start Date & Expected Salary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1.25rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Start Date</label>
                <select 
                  value={settings.startDate || ''}
                  onChange={(e) => handleSettingsChange('startDate', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="tomorrow">Tomorrow</option>
                  <option value="1 week">1 week</option>
                  <option value="2 weeks">2 weeks</option>
                  <option value="3 weeks">3 weeks</option>
                  <option value="1 month">1 month</option>
                </select>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  Actual calendar date calculated automatically relative to application submission date.
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Expected Salary</label>
                <select 
                  value={settings.expectedSalary || ''}
                  onChange={(e) => handleSettingsChange('expectedSalary', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="20,000 - 30,000">$20,000 - $30,000</option>
                  <option value="30,000 - 40,000">$30,000 - $40,000</option>
                  <option value="40,000 - 50,000">$40,000 - $50,000</option>
                  <option value="50,000 - 60,000">$50,000 - $60,000</option>
                  <option value="60,000 - 70,000">$60,000 - $70,000</option>
                  <option value="70,000 - 80,000">$70,000 - $80,000</option>
                  <option value="80,000 - 90,000">$80,000 - $90,000</option>
                  <option value="90,000 - 100,000">$90,000 - $100,000</option>
                  <option value="100,000 - 110,000">$100,000 - $110,000</option>
                  <option value="110,000 - 120,000">$110,000 - $120,000</option>
                  <option value="120,000 - 130,000">$120,000 - $130,000</option>
                  <option value="130,000 - 140,000">$130,000 - $140,000</option>
                  <option value="140,000 - 150,000">$140,000 - $150,000</option>
                  <option value="150,000 - 160,000">$150,000 - $160,000</option>
                  <option value="160,000 - 170,000">$160,000 - $170,000</option>
                  <option value="170,000 - 180,000">$170,000 - $180,000</option>
                  <option value="180,000 - 190,000">$180,000 - $190,000</option>
                  <option value="190,000 - 200,000">$190,000 - $200,000</option>
                  <option value="200,000 - 240,000">$200,000 - $240,000</option>
                  <option value="240,000 - 280,000">$240,000 - $280,000</option>
                  <option value="280,000 - 320,000">$280,000 - $320,000</option>
                  <option value="320,000 - 360,000">$320,000 - $360,000</option>
                  <option value="360,000 - 400,000">$360,000 - $400,000</option>
                  <option value="400,000 - 440,000">$400,000 - $440,000</option>
                  <option value="440,000 - 480,000">$440,000 - $480,000</option>
                  <option value="480,000 - 500,000+">$480,000 - $500,000+</option>
                </select>
              </div>
            </div>

            {/* Row: Willing to Travel, Over 18, Willing to Relocate */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.25rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Willing to Travel</label>
                <select 
                  value={settings.willingToTravel || ''}
                  onChange={(e) => handleSettingsChange('willingToTravel', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  If travel percentage is required, lowest option will be picked automatically.
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Are You Over 18?</label>
                <select 
                  value={settings.isOver18 || ''}
                  onChange={(e) => handleSettingsChange('isOver18', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Willing to Relocate</label>
                <select 
                  value={settings.willingToRelocate || ''}
                  onChange={(e) => handleSettingsChange('willingToRelocate', e.target.value)}
                  style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
                >
                  <option value="">Select...</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                  If Yes, any relocation-based questions will be answered Yes.
                </span>
              </div>
            </div>

            {/* Default Candidate Account Password for Auto Apply */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>Default Job Portal Password</label>
              <input
                type="password"
                value={settings.defaultAccountPassword || ''}
                onChange={(e) => handleSettingsChange('defaultAccountPassword', e.target.value)}
                placeholder="Optional password for automated candidate account creation"
                style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-glass)", color: "var(--text-primary)", padding: "0.75rem", borderRadius: "8px" }}
              />
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                Used by the AI agent to automatically create candidate accounts on portals (e.g. Workday, Taleo) that require login.
              </span>
            </div>

            <div style={{ height: "1px", background: "var(--border-glass)", margin: "0.5rem 0" }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Voluntary Self-ID (EEOC)</h4>
              <label
                htmlFor="skipSelfId"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: "pointer",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "8px",
                  background: settings.skipSelfId ? "rgba(59, 130, 246, 0.12)" : "rgba(0,0,0,0.1)",
                  border: `1px solid ${settings.skipSelfId ? "rgba(59, 130, 246, 0.35)" : "var(--border-glass)"}`,
                  transition: "all 0.2s ease",
                  userSelect: "none",
                  flexShrink: 0,
                }}
              >
                <input
                  id="skipSelfId"
                  type="checkbox"
                  checked={!!settings.skipSelfId}
                  onChange={(e) => handleSettingsChange("skipSelfId", e.target.checked)}
                  style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#3b82f6" }}
                />
                <span style={{ fontSize: "0.82rem", fontWeight: 500, color: settings.skipSelfId ? "#3b82f6" : "var(--text-secondary)", whiteSpace: "nowrap" }}>
                  Skip if not required
                </span>
              </label>
            </div>
            {settings.skipSelfId && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", background: "rgba(59, 130, 246, 0.07)", border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "8px", padding: "0.65rem 0.85rem" }}>
                <Info size={14} style={{ color: "#3b82f6", flexShrink: 0, marginTop: "2px" }} />
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  The AI will attempt to submit applications without completing Self-ID steps. If a Self-ID section turns out to be required, your answers below will be used as a fallback.
                </p>
              </div>
            )}

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
          </div>
        )}
      </div>
      )}
      </div>

      {/* -- 3. Target Profile Section ------------------------------------------ */}
      <div className={`glass-card accordion-card ${openSections['target-profile'] ? 'open' : ''}`} id="target-profile" data-tour="target-profile" style={{ padding: '1.5rem 2rem' }}>
        <div className="accordion-card-header" onClick={() => toggleSection('target-profile')}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Target size={20} className="text-accent" /> Target Profile & Scoring Rubric
          </h3>
          <ChevronDown size={20} className="accordion-chevron" />
        </div>

        {!openSections['target-profile'] && (
          <div className="accordion-summary-box" onClick={() => toggleSection('target-profile')}>
            Ideal role titles, seniority levels, salary expectations, and work preferences. Click to configure.
          </div>
        )}

        {openSections['target-profile'] && (
          <div className="accordion-body">
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
              This text is used by AI automation to score, rank, and evaluate match quality for job opportunities. Update it to reflect your ideal target roles and criteria.
            </p>
            <textarea
              value={settings.profile || ''}
              onChange={(e) => handleSettingsChange('profile', e.target.value)}
              placeholder="Enter target job titles, key skills, industry preferences, and scoring rubric..."
              style={{
                width: '100%',
                minHeight: '180px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                padding: '1rem',
                fontSize: '0.9rem',
                resize: 'vertical'
              }}
            />
          </div>
        )}
      </div>

      {/* ── 4. Base Resume Section ────────────────────────────────────────────── */}
      <div className={`glass-card accordion-card ${openSections['base-resume'] ? 'open' : ''}`} id="base-resume" data-tour="assets-editor" style={{ padding: '1.5rem 2rem' }}>
        <div className="accordion-card-header" onClick={() => toggleSection('base-resume')}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <FileText size={20} className="text-accent" /> Base Resume Text
          </h3>
          <ChevronDown size={20} className="accordion-chevron" />
        </div>

        {!openSections['base-resume'] && (
          <div className="accordion-summary-box" onClick={() => toggleSection('base-resume')}>
            Core master resume text used by AI to generate targeted cover letters and application answers. Click to edit resume.
          </div>
        )}

        {openSections['base-resume'] && (
          <div className="accordion-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Master Resume Text</span>
              <div style={{ display: 'flex', gap: '0.5rem' }} data-tour="assets-upload">
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsingResume}
                  className="btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {parsingResume ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} 
                  {parsingResume ? 'Parsing...' : 'Upload PDF/DOC'}
                </button>
                <input 
                  type="file" 
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                  style={{ display: 'none' }} 
                  ref={fileInputRef}
                  onChange={handleResumeFileUpload}
                />
                <button 
                  type="button"
                  onClick={handlePasteResume}
                  className="btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Clipboard size={16} /> Paste
                </button>
              </div>
            </div>
            <textarea
              value={settings.resumeMarkdown || ''}
              onChange={(e) => handleSettingsChange('resumeMarkdown', e.target.value)}
              placeholder="Paste or write your master base resume in Markdown format..."
              style={{
                width: '100%',
                minHeight: '400px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                padding: '1.25rem',
                fontSize: '0.95rem',
                resize: 'vertical'
              }}
            />
          </div>
        )}
      </div>

      {/* ── 5. Profile Avatar & Display Settings ────────────────────────────────── */}
      <div className={`glass-card accordion-card ${openSections['avatar-settings'] ? 'open' : ''}`} id="avatar-settings" style={{ padding: '1.5rem 2rem' }}>
        <div className="accordion-card-header" onClick={() => toggleSection('avatar-settings')}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
            <ImageIcon size={20} className="text-accent" /> Profile Avatar & Display Settings
          </h3>
          <ChevronDown size={20} className="accordion-chevron" />
        </div>

        {!openSections['avatar-settings'] && (
          <div className="accordion-summary-box" onClick={() => toggleSection('avatar-settings')}>
            Profile picture upload and avatar photo settings. Click to change photo.
          </div>
        )}

        {openSections['avatar-settings'] && (
          <div className="accordion-body">
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
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Subscription Section ────────────────────────────────────────────── */}
      <div className={`glass-card accordion-card ${openSections.subscription ? 'open' : ''}`} id="subscription" style={{ padding: '1.5rem 2rem' }}>
        <div className="accordion-card-header" onClick={() => toggleSection('subscription')}>
          <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
            <CreditCard size={20} className="text-accent" /> Subscription Plan
          </h3>
          <ChevronDown size={20} className="accordion-chevron" />
        </div>

        {!openSections.subscription && (
          <div className="accordion-summary-box" onClick={() => toggleSection('subscription')}>
            Current subscription plan tier and billing features. Click to view details.
          </div>
        )}

        {openSections.subscription && (
          <div className="accordion-body">
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
        )}
      </div>

      {/* Floating Save Button Bar at Bottom */}
      {mounted && createPortal(
        <div className="floating-save-bar">
          {/* Left Saved Status Badge */}
          <div className="save-bar-pill-saved">
            <Bookmark size={14} />
            <span>Saved</span>
          </div>

          {/* Divider */}
          <div className="save-bar-divider" />

          {/* Previous/Scroll circular button */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="save-bar-circle-btn"
            title="Scroll to Top"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Primary Action: Save All Changes */}
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="floating-save-btn"
            title={saving ? "Saving All Changes..." : "Save All Changes"}
          >
            <span className="save-btn-text">{saving ? "Saving All Changes..." : "Save All Changes"}</span>
            {saving ? <Loader2 className="animate-spin" size={16} /> : <ChevronRight size={16} />}
          </button>

          {/* Section Jump Buttons */}
          <button
            type="button"
            onClick={() => handleDockNav("personal-info")}
            className={`save-bar-section-btn ${openSections['personal-info'] ? 'active' : ''}`}
            title="Toggle Personal Info"
          >
            <span>Personal</span>
          </button>

          <button
            type="button"
            onClick={() => handleDockNav("work-auth")}
            className={`save-bar-section-btn ${openSections['work-auth'] ? 'active' : ''}`}
            title="Toggle Demographics & Work Auth"
          >
            <span>Demographics</span>
          </button>

          <button
            type="button"
            onClick={() => handleDockNav("target-profile")}
            className={`save-bar-section-btn ${openSections['target-profile'] ? 'active' : ''}`}
            title="Toggle Target Profile"
          >
            <span>Target Role</span>
          </button>

          <button
            type="button"
            onClick={() => handleDockNav("base-resume")}
            className={`save-bar-section-btn ${openSections['base-resume'] ? 'active' : ''}`}
            title="Toggle Resume"
          >
            <span>Resume</span>
          </button>

          <button
            type="button"
            onClick={() => handleDockNav("avatar-settings")}
            className={`save-bar-section-btn ${openSections['avatar-settings'] ? 'active' : ''}`}
            title="Toggle Avatar Settings"
          >
            <span>Avatar</span>
          </button>

          <button
            type="button"
            onClick={() => handleDockNav("subscription")}
            className={`save-bar-section-btn ${openSections.subscription ? 'active' : ''}`}
            title="Toggle Subscription Plan"
          >
            <span>Plan</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
