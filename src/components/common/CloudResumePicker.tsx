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
          className="btn-outline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.55rem 0.9rem',
            fontSize: '0.85rem',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)',
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
          className="btn-outline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.55rem 0.9rem',
            fontSize: '0.85rem',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)',
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
          className="btn-outline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.55rem 0.9rem',
            fontSize: '0.85rem',
            borderRadius: '8px',
            background: 'rgba(255,255,255,0.03)',
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
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
                backgroundColor: 'var(--card-bg, #18181b)',
                border: '1px solid var(--border-glass, rgba(255, 255, 255, 0.1))',
                borderRadius: '12px',
                padding: '1.5rem',
                color: 'var(--text-primary, #ffffff)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ExternalLink size={20} className="text-accent" /> Import Resume from Cloud Link
                </h3>
                <button
                  onClick={() => setShowUrlModal(false)}
                  disabled={urlLoading}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #a1a1aa)', margin: 0, lineHeight: 1.5 }}>
                Paste any shared Google Drive, Dropbox, or public PDF/Word doc URL below.
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
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-primary)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  disabled={urlLoading}
                  className="btn-outline"
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleParseUrl(urlInput)}
                  disabled={urlLoading || !urlInput.trim()}
                  className="btn-primary"
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
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
