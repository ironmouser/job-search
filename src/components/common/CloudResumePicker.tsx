'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Link2, X, ExternalLink } from 'lucide-react';

interface CloudResumePickerProps {
  onParseSuccess: (markdown: string) => void;
  onParseStart: () => void;
  onParseEnd: () => void;
  onError: (error: string) => void;
}

declare global {
  interface Window {
    Dropbox?: any;
    gapi?: any;
    google?: any;
  }
}

export default function CloudResumePicker({
  onParseSuccess,
  onParseStart,
  onParseEnd,
  onError,
}: CloudResumePickerProps) {
  const [mounted, setMounted] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load Dropbox SDK if app key exists
  useEffect(() => {
    const dropboxKey = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY;
    if (dropboxKey && !document.getElementById('dropboxjs')) {
      const script = document.createElement('script');
      script.id = 'dropboxjs';
      script.type = 'text/javascript';
      script.src = 'https://www.dropbox.com/static/api/2/dropins.js';
      script.setAttribute('data-app-key', dropboxKey);
      document.body.appendChild(script);
    }
  }, []);

  const handleParseUrl = async (urlToParse: string, name?: string) => {
    if (!urlToParse.trim()) return;
    onParseStart();
    setUrlLoading(true);

    try {
      const res = await fetch('/api/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: urlToParse.trim(), fileName: name || 'resume.pdf' }),
      });

      const data = await res.json();
      if (res.ok && data.markdown) {
        onParseSuccess(data.markdown);
        setShowUrlModal(false);
        setUrlInput('');
      } else {
        onError(data.error || 'Failed to parse remote file.');
      }
    } catch (e: any) {
      console.error(e);
      onError('Error fetching or parsing cloud file.');
    } finally {
      onParseEnd();
      setUrlLoading(false);
    }
  };

  const handleDropboxClick = () => {
    if (window.Dropbox && typeof window.Dropbox.choose === 'function') {
      window.Dropbox.choose({
        success: (files: any[]) => {
          if (files && files.length > 0) {
            handleParseUrl(files[0].link, files[0].name);
          }
        },
        cancel: () => {},
        linkType: 'direct',
        multiselect: false,
        extensions: ['.pdf', '.docx', '.doc'],
      });
    } else {
      // Fallback to URL modal if SDK or Key is not configured
      setShowUrlModal(true);
    }
  };

  const handleGoogleDriveClick = () => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (apiKey && clientId && window.gapi) {
      window.gapi.load('picker', () => {
        if (window.google?.accounts?.oauth2) {
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.readonly',
            callback: (response: any) => {
              if (response.access_token) {
                const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
                view.setMimeTypes('application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document');

                const picker = new window.google.picker.PickerBuilder()
                  .addView(view)
                  .setOAuthToken(response.access_token)
                  .setDeveloperKey(apiKey)
                  .setCallback((data: any) => {
                    if (data.action === window.google.picker.Action.PICKED) {
                      const doc = data.docs[0];
                      const fileId = doc.id;
                      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
                      handleParseUrl(downloadUrl, doc.name);
                    }
                  })
                  .build();
                picker.setVisible(true);
              }
            },
          });
          client.requestAccessToken();
        } else {
          setShowUrlModal(true);
        }
      });
    } else {
      // Fallback to URL modal if SDK or Key is not configured
      setShowUrlModal(true);
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          marginTop: '0.75rem',
          flexWrap: 'wrap',
          width: '100%',
        }}
      >
        <button
          type="button"
          onClick={handleGoogleDriveClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.55rem 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            color: '#1e293b',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 87.3 78" fill="none">
            <path d="M6.6 66.85l21.2-36.7h52.9l-21.2 36.7H6.6z" fill="#0066DA" />
            <path d="M43.65 2.65l21.2 36.7L43.65 76 22.45 39.35l21.2-36.7z" fill="#00AC47" />
            <path d="M73.55 66.85L52.35 30.15 31.15 66.85h42.4z" fill="#EA4335" />
            <path d="M43.65 2.65L64.85 39.35 86.05 2.65H43.65z" fill="#FFBA00" />
          </svg>
          <span>Google Drive</span>
        </button>

        <button
          type="button"
          onClick={handleDropboxClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.55rem 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            color: '#1e293b',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            cursor: 'pointer',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#0061FE">
            <path d="M6 2l6 4-6 4-6-4 6-4zm12 0l6 4-6 4-6-4 6-4zM0 14l6-4 6 4-6 4-6-4zm18-4l6 4-6 4-6-4 6-4zm-6 5l6 4-6 4-6-4 6-4z" />
          </svg>
          <span>Dropbox</span>
        </button>

        <button
          type="button"
          onClick={() => setShowUrlModal(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.55rem 0.9rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            borderRadius: '8px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            color: '#1e293b',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            cursor: 'pointer',
          }}
        >
          <Link2 size={15} />
          <span>Paste Cloud Link</span>
        </button>
      </div>

      {/* Cloud Link Fallback Modal */}
      {mounted &&
        showUrlModal &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              padding: '1rem',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !urlLoading) setShowUrlModal(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              style={{
                width: '100%',
                maxWidth: '460px',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '1.75rem',
                color: 'var(--card-foreground)',
                boxShadow: 'var(--shadow-lg)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--card-foreground)' }}>
                  <ExternalLink size={20} style={{ color: 'var(--accent-primary)' }} /> Import Resume from Cloud Link
                </h3>
                <button
                  onClick={() => setShowUrlModal(false)}
                  disabled={urlLoading}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Paste any shared Google Drive, Google Docs, Dropbox, or public PDF/Word document URL below.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="url"
                  placeholder="https://drive.google.com/file/d/... or https://dropbox.com/s/..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  disabled={urlLoading}
                  style={{
                    padding: '0.6rem 1.1rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    backgroundColor: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleParseUrl(urlInput)}
                  disabled={urlLoading || !urlInput.trim()}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    backgroundColor: urlLoading || !urlInput.trim() ? '#93c5fd' : '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    cursor: urlLoading || !urlInput.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {urlLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                  {urlLoading ? 'Downloading & Parsing...' : 'Import & Parse'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
