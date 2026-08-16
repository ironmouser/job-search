"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent, ClipboardEvent } from "react";
import { X, Upload, Download, AlertCircle, Edit2, Check, FileText, ShoppingCart } from "lucide-react";

export interface EmailChip {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isValid: boolean;
}

interface BulkEmailInputProps {
  chips: EmailChip[];
  onChange: (chips: EmailChip[]) => void;
  disabled?: boolean;
  remainingSeats?: number;
  onBuyMoreSeats?: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Parses raw CSV text supporting standard headers (email, first_name, last_name)
 * or freeform rows with emails and optional names.
 */
function parseCsvContent(text: string, existingChips: EmailChip[]): EmailChip[] {
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return existingChips;

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === "," || char === "\t" || char === ";") && !inQuotes) {
        result.push(cur.trim().replace(/^["']|["']$/g, ""));
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^["']|["']$/g, ""));
    return result;
  };

  const firstRowCols = parseCsvLine(lines[0]);
  const lowerCols = firstRowCols.map((c) => c.toLowerCase());

  const emailIndex = lowerCols.findIndex(
    (c) => c === "email" || c === "e-mail" || c === "email address" || c === "emailaddress"
  );
  const firstNameIndex = lowerCols.findIndex(
    (c) => c === "first_name" || c === "firstname" || c === "first name" || c === "first"
  );
  const lastNameIndex = lowerCols.findIndex(
    (c) => c === "last_name" || c === "lastname" || c === "last name" || c === "last"
  );
  const nameIndex = lowerCols.findIndex(
    (c) => c === "name" || c === "full_name" || c === "fullname" || c === "full name"
  );

  const hasHeader = emailIndex !== -1;
  const dataRows = hasHeader ? lines.slice(1) : lines;

  const newChips: EmailChip[] = [...existingChips];
  const seenEmails = new Set(existingChips.map((c) => c.email.toLowerCase()));

  for (const row of dataRows) {
    if (!row) continue;
    const cols = parseCsvLine(row);

    let email = "";
    let firstName: string | undefined = undefined;
    let lastName: string | undefined = undefined;

    if (hasHeader) {
      email = cols[emailIndex] || "";
      if (firstNameIndex !== -1 && cols[firstNameIndex]) firstName = cols[firstNameIndex];
      if (lastNameIndex !== -1 && cols[lastNameIndex]) lastName = cols[lastNameIndex];
      if (!firstName && !lastName && nameIndex !== -1 && cols[nameIndex]) {
        const parts = cols[nameIndex].split(" ");
        firstName = parts[0];
        lastName = parts.slice(1).join(" ") || undefined;
      }
    } else {
      const detectedEmailCol = cols.find((c) => validateEmail(c));
      if (detectedEmailCol) {
        email = detectedEmailCol;
      } else if (cols.length > 0) {
        email = cols[0];
      }
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) continue;

    const lowerEmail = cleanEmail.toLowerCase();
    if (!seenEmails.has(lowerEmail)) {
      seenEmails.add(lowerEmail);
      newChips.push({
        id: Math.random().toString(36).substring(2, 9),
        email: cleanEmail,
        firstName: firstName?.trim() || undefined,
        lastName: lastName?.trim() || undefined,
        isValid: validateEmail(cleanEmail),
      });
    }
  }

  return newChips;
}

export function BulkEmailInput({
  chips,
  onChange,
  disabled,
  remainingSeats,
  onBuyMoreSeats,
}: BulkEmailInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validCount = chips.filter((c) => c.isValid).length;
  const invalidCount = chips.filter((c) => !c.isValid).length;
  const isOverCapacity = remainingSeats !== undefined && validCount > remainingSeats;
  const excessCount = isOverCapacity ? validCount - remainingSeats : 0;

  const addEmails = (rawText: string) => {
    if (!rawText) return;

    // Split by comma, semicolon, newline, carriage return, space
    const tokens = rawText
      .split(/[,;\n\r\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (tokens.length === 0) return;

    const newChips: EmailChip[] = [...chips];
    const seen = new Set(newChips.map((c) => c.email.toLowerCase()));

    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
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

    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const updatedChips = parseCsvContent(text, chips);
        onChange(updatedChips);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearFile = () => {
    setUploadedFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onChange([]);
  };

  const downloadSampleCsv = () => {
    const sampleContent =
      "email,first_name,last_name\n" +
      "alex.smith@example.com,Alex,Smith\n" +
      "jordan.lee@example.com,Jordan,\n" +
      "taylor.wong@example.com,,\n";

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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>
            Recipients: <span style={{ color: isOverCapacity ? "#dc2626" : "#3695e3", fontWeight: 700 }}>{validCount}</span>
          </span>

          {remainingSeats !== undefined && (
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: remainingSeats > 0 ? "var(--text-secondary)" : "#dc2626",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "2px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-glass)",
              }}
            >
              Seats Available: <span style={{ color: remainingSeats > 0 ? "#10b981" : "#dc2626" }}>{remainingSeats}</span>
            </span>
          )}

          {isOverCapacity && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                color: "#dc2626",
                fontSize: "0.8rem",
                fontWeight: 600,
                background: "#fee2e2",
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid #fecaca",
              }}
            >
              <AlertCircle size={14} color="#dc2626" />
              Exceeds seats by {excessCount}
            </span>
          )}

          {invalidCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "#dc2626",
                fontSize: "0.825rem",
                fontWeight: 600,
                background: "#fee2e2",
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #fecaca",
              }}
            >
              <AlertCircle size={15} color="#dc2626" />
              {invalidCount} invalid email{invalidCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* CSV Actions & File Pill */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          {uploadedFileName && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(54, 149, 227, 0.12)",
                color: "#3695e3",
                border: "1px solid rgba(54, 149, 227, 0.3)",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: "0.8rem",
                fontWeight: 500,
              }}
            >
              <FileText size={14} />
              <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {uploadedFileName}
              </span>
              <button
                type="button"
                onClick={handleClearFile}
                title="Remove file and clear recipients"
                style={{
                  background: "none",
                  border: "none",
                  color: "#3695e3",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={14} />
              </button>
            </span>
          )}

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
              fontSize: "0.825rem",
              fontWeight: 500,
              cursor: "pointer",
              textDecoration: "underline",
            }}
            title="Download example CSV template with email, first_name, last_name"
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
              background: "var(--bg-glass, rgba(255,255,255,0.06))",
              border: "1px solid var(--border-glass, #cbd5e1)",
              borderRadius: 8,
              color: "var(--text-primary)",
              padding: "6px 14px",
              fontSize: "0.825rem",
              fontWeight: 600,
              cursor: disabled ? "not-allowed" : "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            }}
          >
            <Upload size={14} /> Upload CSV
          </button>

          {onBuyMoreSeats && isOverCapacity && (
            <button
              type="button"
              onClick={onBuyMoreSeats}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#10b981",
                border: "none",
                borderRadius: 8,
                color: "#ffffff",
                padding: "6px 12px",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <ShoppingCart size={13} /> Buy Seats
            </button>
          )}
        </div>
      </div>

      {/* Main Expanding Container */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          minHeight: 100,
          width: "100%",
          padding: "12px 14px",
          background: "rgba(0, 0, 0, 0.05)",
          border: isOverCapacity || invalidCount > 0 ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid var(--border-glass)",
          borderRadius: 12,
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
          const displayName = [chip.firstName, chip.lastName].filter(Boolean).join(" ");

          if (isEditing) {
            return (
              <div
                key={chip.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(0,0,0,0.08)",
                  border: "1px solid #3695e3",
                  borderRadius: 9999,
                  padding: "4px 12px",
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
                padding: "6px 14px",
                borderRadius: 9999,
                fontSize: "0.85rem",
                fontWeight: 500,
                transition: "all 0.15s ease",
                background: chip.isValid ? "#e2e8f0" : "#fecaca",
                color: chip.isValid ? "#1e293b" : "#991b1b",
                border: chip.isValid ? "1px solid transparent" : "1px solid #ef4444",
              }}
            >
              <span
                onClick={() => !chip.isValid && startEditing(chip)}
                style={{ cursor: chip.isValid ? "default" : "pointer" }}
                title={
                  displayName
                    ? `${displayName} (${chip.email})`
                    : chip.isValid
                    ? chip.email
                    : "Invalid email address. Click to edit."
                }
              >
                {displayName ? `${displayName} <${chip.email}>` : chip.email}
              </span>

              {!chip.isValid && (
                <button
                  type="button"
                  onClick={() => startEditing(chip)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Edit invalid email"
                >
                  <Edit2 size={13} />
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
                  color: chip.isValid ? "#64748b" : "#ef4444",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Remove recipient"
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
            padding: "6px 0",
          }}
        />
      </div>
      <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)" }}>
        Tip: Type or paste multiple emails, or upload a CSV with columns (email, first_name, last_name). Click an invalid email chip to edit it.
      </p>
    </div>
  );
}
