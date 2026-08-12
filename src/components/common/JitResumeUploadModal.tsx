'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, FileText, Loader2, X, Sparkles } from 'lucide-react';
import CloudResumePicker from '@/components/common/CloudResumePicker';
import { trackJitResumeModalOpen, trackJitResumeModalDismiss, trackJitResumeUploadSuccess } from '@/lib/analytics';

interface JitResumeUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (resumeMarkdown: string) => void;
  title?: string;
  description?: string;
}

export default function JitResumeUploadModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Add Base Resume to Continue',
  description = 'To generate tailored resumes, cover letters, or auto-apply to jobs, please add your base resume template.',
}: JitResumeUploadModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setResumeText('');
      setErrorMsg('');
      trackJitResumeModalOpen(title);
    }
  }, [isOpen, title]);

  const handleClose = () => {
    trackJitResumeModalDismiss();
    onClose();
  };

  if (!isOpen || !mounted) return null;

  const handleFileParse = async (file: File) => {
    setIsParsing(true);
    setErrorMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (data.markdown) {
        setResumeText(data.markdown);
      } else {
        setErrorMsg(data.error || 'Failed to parse file.');
      }
    } catch (e) {
      setErrorMsg('Error parsing resume file.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileParse(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileParse(e.target.files[0]);
    }
  };

  const handleSave = async () => {
    if (!resumeText.trim()) {
      setErrorMsg('Please upload a resume file or paste resume text before continuing.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/assets/base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: resumeText.trim() }),
      });

      if (res.ok) {
        trackJitResumeUploadSuccess();
        onSuccess(resumeText.trim());
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error || 'Failed to save base resume. Please try again.');
      }
    } catch (e) {
      setErrorMsg('An unexpected error occurred while saving resume.');
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.65)',
        padding: '1rem',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '620px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--card)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          padding: '1.75rem',
          boxSizing: 'border-box',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          color: 'var(--card-foreground)',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--foreground)' }}>
              <FileText className="text-accent" size={22} />
              {title}
            </h3>
            <p style={{ color: 'var(--muted-foreground)', fontSize: '0.88rem', marginTop: '0.35rem', marginBottom: 0, lineHeight: 1.4 }}>
              {description}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {errorMsg}
          </div>
        )}

        {/* Drag & Drop Upload Area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${isDragging ? 'var(--accent-primary)' : 'var(--border)'}`,
            background: isDragging ? 'var(--accent-glow)' : 'var(--secondary)',
            padding: '1.5rem',
            borderRadius: '8px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            marginBottom: '1rem',
          }}
        >
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          {isParsing ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)' }}>
              <Loader2 className="animate-spin" size={28} />
              <span style={{ fontSize: '0.9rem' }}>Parsing resume with AI...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
              <UploadCloud size={28} style={{ color: isDragging ? 'var(--accent-primary)' : 'inherit' }} />
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Drag & Drop PDF or Word Doc</span>
              <span style={{ fontSize: '0.8rem' }}>or click to browse from device</span>
            </div>
          )}
        </div>

        <CloudResumePicker
          onParseStart={() => setIsParsing(true)}
          onParseEnd={() => setIsParsing(false)}
          onParseSuccess={(markdown) => setResumeText(markdown)}
          onError={(err) => setErrorMsg(err)}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-glass, rgba(255,255,255,0.1))' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600 }}>OR PASTE TEXT</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-glass, rgba(255,255,255,0.1))' }} />
        </div>

        <textarea
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="Paste your resume markdown or plain text here..."
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--border-glass, rgba(255,255,255,0.15))',
            color: 'var(--text-primary)',
            padding: '0.85rem',
            borderRadius: '8px',
            minHeight: '140px',
            resize: 'vertical',
            fontSize: '0.88rem',
            fontFamily: 'inherit',
          }}
        />

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            className="btn-outline"
            style={{ padding: '0.6rem 1.1rem', fontSize: '0.88rem' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isParsing || !resumeText.trim()}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.25rem',
              fontSize: '0.88rem',
              opacity: !resumeText.trim() ? 0.6 : 1,
            }}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {isSaving ? 'Saving...' : 'Save & Continue'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
