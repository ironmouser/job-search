"use client";

import { useState, useEffect } from "react";
import { User, Image as ImageIcon, CreditCard, Save, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Cropper from "react-easy-crop";

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
  const [redirecting, setRedirecting] = useState(false);

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

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, image }),
      });

      if (!res.ok) throw new Error("Failed to save");
      alert("Profile updated successfully!");
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
      {cropImageSrc && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "90%", maxWidth: "500px", background: "var(--background-secondary)", borderRadius: "12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative", width: "100%", height: "400px", backgroundColor: "#000" }}>
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
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", backgroundColor: "var(--background-primary)" }}>
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
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
                <button className="btn-outline" onClick={() => setCropImageSrc(null)} disabled={saving}>Cancel</button>
                <button className="btn-primary" onClick={handleConfirmCrop} disabled={saving}>{saving ? "Uploading..." : "Confirm & Upload"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Section */}
      <div className="glass-card">
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <User size={20} className="text-accent" /> Personal Information
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Email Address</label>
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
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <Shield size={12} /> Securely managed via Passwordless Login
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Display Name</label>
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

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Profile Photo</label>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                {image ? (
                  <img
                    src={image}
                    alt="Profile"
                    style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-glass)" }}
                  />
                ) : (
                  <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-glass)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <ImageIcon size={20} color="var(--text-secondary)" />
                  </div>
                )}
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
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {/* Subscription Section */}
      <div className="glass-card">
        <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
          <CreditCard size={20} className="text-accent" /> Subscription
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid var(--border-glass)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>Current Plan</span>
              <span style={{ fontSize: "1.25rem", fontWeight: 600, color: planTier === "PRO" ? "var(--accent-primary)" : "var(--text-primary)" }}>
                {planTier === "PRO" ? "Job Agent Pro" : "Free Plan"}
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
