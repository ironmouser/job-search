"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent, ClipboardEvent } from "react";
import { X, Upload, Download, AlertCircle, Edit2, Check } from "lucide-react";

export interface EmailChip {
  id: string;
  email: string;
  isValid: boolean;
}

interface BulkEmailInputProps {
  chips: EmailChip[];
  onChange: (chips: EmailChip[]) => void;
  disabled?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function BulkEmailInput({ chips, onChange, disabled }: BulkEmailInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validCount = chips.filter((c) => c.isValid).length;
  const invalidCount = chips.filter((c) => !c.isValid).length;

  const addEmails = (rawText: string) => {
    if (!rawText) return;

    // Split by comma, semicolon, newline, carriage return, space
    const tokens = rawText
      .split(/[,;\n\r\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) return;

    const newChips: EmailChip[] = [...chips];

    for (const token of tokens) {
      const exists = newChips.some((c) => c.email.toLowerCase() === token.toLowerCase());
      if (!exists) {
        newChips.push({
          id: Math.random().toString(36).substring(2, 9),
          email: token,
          isValid: validateEmail(token),
        });
      }
    }

    onChange(newChips);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (["Enter", ",", ";", "Tab"].includes(e.key)) {
      e.preventDefault();
      if (inputValue.trim()) {
        addEmails(inputValue);
        setInputValue("");
      }
    } else if (e.key === "Backspace" && !inputValue && chips.length > 0) {
      onChange(chips.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (inputValue.trim()) {
      addEmails(inputValue);
      setInputValue("");
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    addEmails(pastedText);
    setInputValue("");
  };

  const removeChip = (id: string) => {
    onChange(chips.filter((c) => c.id !== id));
  };

  const startEditing = (chip: EmailChip) => {
    setEditingId(chip.id);
    setEditingValue(chip.email);
  };

  const saveEditing = (id: string) => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      removeChip(id);
    } else {
      onChange(
        chips.map((c) =>
          c.id === id
            ? { ...c, email: trimmed, isValid: validateEmail(trimmed) }
            : c
        )
      );
    }
    setEditingId(null);
    setEditingValue("");
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      alert("Please select a valid .csv file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        addEmails(text);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadSampleCsv = () => {
    const sampleContent = "email\nalice@example.com\nbob.smith@company.org\ncarol.johnson@domain.io\n";
    const blob = new Blob([sampleContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "sample_invitations.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Counters & Info Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
            Email Recipient Count: <span style={{ color: "#3695e3" }}>{validCount}</span>
          </span>
          {invalidCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "#ef4444",
                fontSize: "0.8rem",
                fontWeight: 600,
                background: "rgba(239, 68, 68, 0.15)",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              <AlertCircle size={14} />
              {invalidCount} invalid email address{invalidCount > 1 ? "es" : ""}
            </span>
          )}
        </div>

        {/* CSV Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={downloadSampleCsv}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              fontSize: "0.78rem",
              fontWeight: 500,
              cursor: "pointer",
              textDecoration: "underline",
            }}
            title="Download example CSV file"
          >
            <Download size={14} /> Download Sample CSV
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--border-glass)",
              borderRadius: 6,
              color: "var(--text-primary)",
              padding: "6px 12px",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
          >
            <Upload size={14} /> Upload CSV
          </button>
        </div>
      </div>

      {/* Main Expanding Container */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          minHeight: 96,
          width: "100%",
          padding: 12,
          background: "rgba(0, 0, 0, 0.2)",
          border: invalidCount > 0 ? "1px solid rgba(239, 68, 68, 0.5)" : "1px solid var(--border-glass)",
          borderRadius: 8,
          display: "flex",
          flexWrap: "wrap",
          alignContent: "flex-start",
          gap: 8,
          cursor: "text",
          transition: "border-color 0.15s ease",
        }}
      >
        {chips.map((chip) => {
          const isEditing = editingId === chip.id;

          if (isEditing) {
            return (
              <div
                key={chip.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "rgba(0,0,0,0.6)",
                  border: "1px solid #3695e3",
                  borderRadius: 6,
                  padding: "2px 6px",
                }}
              >
                <input
                  type="email"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEditing(chip.id);
                    } else if (e.key === "Escape") {
                      setEditingId(null);
                    }
                  }}
                  autoFocus
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    outline: "none",
                    minWidth: 160,
                  }}
                />
                <button
                  type="button"
                  onClick={() => saveEditing(chip.id)}
                  style={{ background: "none", border: "none", color: "#10b981", cursor: "pointer", padding: 2 }}
                >
                  <Check size={14} />
                </button>
              </div>
            );
          }

          return (
            <div
              key={chip.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: "0.85rem",
                fontWeight: 500,
                transition: "all 0.15s ease",
                background: chip.isValid ? "rgba(255, 255, 255, 0.1)" : "rgba(239, 68, 68, 0.3)",
                color: chip.isValid ? "var(--text-primary)" : "#fca5a5",
                border: chip.isValid ? "1px solid var(--border-glass)" : "1px solid rgba(239, 68, 68, 0.5)",
              }}
            >
              <span
                onClick={() => !chip.isValid && startEditing(chip)}
                style={{ cursor: chip.isValid ? "default" : "pointer" }}
                title={chip.isValid ? chip.email : "Invalid email address. Click to edit."}
              >
                {chip.email}
              </span>

              {!chip.isValid && (
                <button
                  type="button"
                  onClick={() => startEditing(chip)}
                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 0 }}
                  title="Edit invalid email"
                >
                  <Edit2 size={12} />
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(chip.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: chip.isValid ? "var(--text-secondary)" : "#fca5a5",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Remove email"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={chips.length === 0 ? "Type or paste emails separated by commas..." : "Add more..."}
          style={{
            flex: 1,
            minWidth: 200,
            background: "transparent",
            border: "none",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            outline: "none",
            padding: "4px 0",
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
        Tip: Type or paste multiple emails separated by commas, spaces, or line breaks. Click an invalid email chip to edit it.
      </p>
    </div>
  );
}
