"use client";

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { AssetFormat } from '@/lib/docxGeneratorHelper';

interface AssetFormatToggleProps {
    format: AssetFormat;
    onChange: (format: AssetFormat) => void;
    persistOnToggle?: boolean;
    compact?: boolean;
}

export default function AssetFormatToggle({
    format,
    onChange,
    persistOnToggle = false,
    compact = false,
}: AssetFormatToggleProps) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSelect = async (nextFormat: AssetFormat) => {
        if (nextFormat === format || isSaving) return;
        onChange(nextFormat);

        if (persistOnToggle) {
            setIsSaving(true);
            try {
                await fetch('/api/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ preferredAssetFormat: nextFormat }),
                });
            } catch (err) {
                console.warn('Failed to persist preferredAssetFormat:', err);
            } finally {
                setIsSaving(false);
            }
        }
    };

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: compact ? '0.4rem' : '0.6rem',
                flexWrap: 'wrap',
            }}
        >
            {!compact && (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                    }}
                >
                    <FileText size={14} />
                    Download Format:
                </span>
            )}
            <div
                role="group"
                aria-label="Asset file format"
                style={{
                    display: 'inline-flex',
                    background: 'var(--bg-color)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '2px',
                    gap: '2px',
                }}
            >
                {(['pdf', 'docx'] as AssetFormat[]).map((opt) => {
                    const active = format === opt;
                    return (
                        <button
                            key={opt}
                            type="button"
                            onClick={() => handleSelect(opt)}
                            disabled={isSaving}
                            style={{
                                padding: compact ? '0.25rem 0.6rem' : '0.35rem 0.8rem',
                                fontSize: compact ? '0.75rem' : '0.8rem',
                                fontWeight: active ? 700 : 500,
                                borderRadius: '6px',
                                border: 'none',
                                cursor: isSaving ? 'wait' : 'pointer',
                                background: active ? 'var(--accent-primary)' : 'transparent',
                                color: active ? '#000' : 'var(--text-secondary)',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {opt === 'pdf' ? 'PDF (.pdf)' : 'Word (.docx)'}
                        </button>
                    );
                })}
            </div>
            {isSaving && <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />}
        </div>
    );
}
