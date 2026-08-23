'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, FileText, SlidersHorizontal, ShieldCheck, CheckCircle2, Sparkles, Zap } from 'lucide-react';

interface AutoApplyHowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AutoApplyHowItWorksModal({ isOpen, onClose }: AutoApplyHowItWorksModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const steps = [
    {
      num: 1,
      title: 'Finding the Direct Application Form',
      description: 'The AI follows the job link and automatically resolves aggregator pages (like Indeed, LinkedIn, or Google) to find the employer\'s official direct career page or ATS portal.',
      icon: <Search size={20} color="var(--accent-primary, #0070f3)" />,
    },
    {
      num: 2,
      title: 'Tailoring Your Assets',
      description: 'Your base resume and cover letter are custom-tailored to the target job description and company background, highlighting relevant skills and achievements.',
      icon: <FileText size={20} color="var(--accent-primary, #0070f3)" />,
    },
    {
      num: 3,
      title: 'Form Mapping & Profile Autofill',
      description: 'Form fields (contact info, work authorization, education, past experience, and LinkedIn links) are accurately matched and filled in the employer\'s ATS form.',
      icon: <SlidersHorizontal size={20} color="var(--accent-primary, #0070f3)" />,
    },
    {
      num: 4,
      title: 'Screening & Q&A Handling',
      description: 'Screening questions and custom employer prompts are answered based on your background. If a question requires manual input or a captcha appears, you are notified to complete it.',
      icon: <ShieldCheck size={20} color="var(--accent-primary, #0070f3)" />,
    },
    {
      num: 5,
      title: 'Review & Submission Proof',
      description: 'The AI reviews all mapped answers, completes the submission, and captures a timestamped screenshot confirmation receipt for your records.',
      icon: <CheckCircle2 size={20} color="#10b981" />,
    },
  ];

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card, #111111)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
          borderRadius: '16px',
          padding: '1.75rem',
          maxWidth: '580px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          position: 'relative',
          color: 'var(--text-primary, #ededed)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(0, 112, 243, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary, #0070f3)',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>How AI Auto Apply Works</h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary, #a3a3a3)' }}>
                End-to-end automated job applications tailored to your profile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #a3a3a3)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 5 Steps List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
          {steps.map((step) => (
            <div
              key={step.num}
              style={{
                display: 'flex',
                gap: '1rem',
                padding: '0.9rem',
                borderRadius: '10px',
                background: 'var(--bg-secondary, rgba(255, 255, 255, 0.03))',
                border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.06))',
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: 'var(--card-header-bg, rgba(255, 255, 255, 0.05))',
                  border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {step.icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary, #ededed)' }}>
                  {step.num}. {step.title}
                </span>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary, #a3a3a3)', lineHeight: 1.45 }}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer info note */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #a3a3a3)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Zap size={14} color="#f59e0b" /> You stay in control with live status and confirmation proof
          </span>
          <button
            onClick={onClose}
            className="btn btn-primary"
            style={{
              padding: '0.55rem 1.25rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
