"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Building2, Send, CheckCircle2, ShieldCheck, Mail, Phone, User, Hash } from "lucide-react";

interface ContactSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  initialSeats?: number;
  initialUserEmail?: string;
  initialUserName?: string;
}

export function ContactSalesModal({
  isOpen,
  onClose,
  orgId,
  orgName,
  initialSeats = 5000,
  initialUserEmail = "",
  initialUserName = "",
}: ContactSalesModalProps) {
  const [mounted, setMounted] = useState(false);
  const [contactName, setContactName] = useState(initialUserName);
  const [contactEmail, setContactEmail] = useState(initialUserEmail);
  const [phone, setPhone] = useState("");
  const [requestedSeats, setRequestedSeats] = useState(initialSeats);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialSeats) setRequestedSeats(initialSeats);
    if (initialUserEmail) setContactEmail(initialUserEmail);
    if (initialUserName) setContactName(initialUserName);
  }, [initialSeats, initialUserEmail, initialUserName]);

  if (!isOpen || !mounted) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !requestedSeats) {
      setError("Please fill in all required fields (Name, Email, Pass Quantity).");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/org/${orgId}/contact-sales`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          phone: phone.trim(),
          requestedSeats: Number(requestedSeats),
          notes: notes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit enterprise request.");
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setError(null);
    onClose();
  };

  const modalContent = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        padding: "1rem",
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
          padding: "1.75rem",
          position: "relative",
          color: "var(--card-foreground)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "transparent",
            border: "none",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            padding: 4,
            borderRadius: 6,
          }}
        >
          <X size={20} />
        </button>

        {submitted ? (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem auto",
              }}
            >
              <CheckCircle2 size={36} />
            </div>
            <h3 style={{ fontSize: "1.35rem", fontWeight: 700, margin: "0 0 8px 0" }}>Inquiry Submitted!</h3>
            <p style={{ color: "#9ca3af", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: 20 }}>
              Thank you for reaching out! We have received your Enterprise inquiry for{" "}
              <strong style={{ color: "#38bdf8" }}>{requestedSeats.toLocaleString()} passes</strong> for{" "}
              <strong style={{ color: "#f3f4f6" }}>{orgName}</strong>.
            </p>
            <p style={{ color: "#6b7280", fontSize: "0.825rem", marginBottom: 24 }}>
              A member of our team will contact you at <strong>{contactEmail}</strong> or via email at{" "}
              <strong>support@jobagenthq.com</strong> within 24 hours with custom invoicing and quote details.
            </p>
            <button
              onClick={handleClose}
              style={{
                background: "#3695e3",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: "0.9rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: "rgba(139, 92, 246, 0.15)",
                  color: "#a855f7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Building2 size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Contact Enterprise Sales</h3>
                <p style={{ fontSize: "0.825rem", color: "#9ca3af", margin: 0 }}>
                  Custom pricing, ACH invoicing & SLA contracts for 5,000+ seat orders
                </p>
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#fca5a5",
                  fontSize: "0.85rem",
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Org Name (Read Only) */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#9ca3af", marginBottom: 4 }}>
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  disabled
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 8,
                    padding: "9px 12px",
                    color: "#9ca3af",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Name & Email Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#9ca3af", marginBottom: 4 }}>
                    Contact Name *
                  </label>
                  <div style={{ position: "relative" }}>
                    <User size={16} style={{ position: "absolute", left: 10, top: 11, color: "#6b7280" }} />
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      style={{
                        width: "100%",
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: 8,
                        padding: "9px 12px 9px 34px",
                        color: "#f3f4f6",
                        fontSize: "0.875rem",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#9ca3af", marginBottom: 4 }}>
                    Contact Email *
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail size={16} style={{ position: "absolute", left: 10, top: 11, color: "#6b7280" }} />
                    <input
                      type="email"
                      required
                      placeholder="jane@org.edu"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      style={{
                        width: "100%",
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: 8,
                        padding: "9px 12px 9px 34px",
                        color: "#f3f4f6",
                        fontSize: "0.875rem",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Phone & Requested Seats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#9ca3af", marginBottom: 4 }}>
                    Phone Number (Optional)
                  </label>
                  <div style={{ position: "relative" }}>
                    <Phone size={16} style={{ position: "absolute", left: 10, top: 11, color: "#6b7280" }} />
                    <input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{
                        width: "100%",
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: 8,
                        padding: "9px 12px 9px 34px",
                        color: "#f3f4f6",
                        fontSize: "0.875rem",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#9ca3af", marginBottom: 4 }}>
                    Estimated Pass Quantity *
                  </label>
                  <div style={{ position: "relative" }}>
                    <Hash size={16} style={{ position: "absolute", left: 10, top: 11, color: "#6b7280" }} />
                    <input
                      type="number"
                      min={5000}
                      required
                      value={requestedSeats}
                      onChange={(e) => setRequestedSeats(Number(e.target.value))}
                      style={{
                        width: "100%",
                        background: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        borderRadius: 8,
                        padding: "9px 12px 9px 34px",
                        color: "#f3f4f6",
                        fontSize: "0.875rem",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#9ca3af", marginBottom: 4 }}>
                  Additional Notes / Requirements (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Tell us about your organization, payment requirements (ACH/PO), or contract start timeline..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    width: "100%",
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 8,
                    padding: "9px 12px",
                    color: "#f3f4f6",
                    fontSize: "0.875rem",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  background: submitting ? "#4b5563" : "#8b5cf6",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  padding: "12px 20px",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {submitting ? "Sending Request..." : "Submit Enterprise Request to Support"}
                {!submitting && <Send size={16} />}
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  marginTop: 12,
                  color: "#6b7280",
                  fontSize: "0.75rem",
                }}
              >
                <ShieldCheck size={14} />
                Inquiry goes directly to support@jobagenthq.com. Response guaranteed within 24h.
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
