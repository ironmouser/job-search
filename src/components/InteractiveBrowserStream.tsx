'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RefreshCw,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Radio,
  Keyboard,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InteractiveBrowserStreamProps {
  isOpen: boolean;
  sessionId: string;
  interventionId: string;
  portalName?: string;
  onClose: () => void;
  onResolved: () => void;
}

export function InteractiveBrowserStream({
  isOpen,
  sessionId,
  interventionId,
  portalName = 'Job Board',
  onClose,
  onResolved,
}: InteractiveBrowserStreamProps) {
  const [mounted, setMounted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showInputBar, setShowInputBar] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Connect to SSE stream
  useEffect(() => {
    if (!isOpen || !sessionId) return;

    const streamUrl = `/api/worker/sessions/${sessionId}/stream`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.addEventListener('frame', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.frame) {
          setFrameSrc(`data:image/jpeg;base64,${payload.frame}`);
        }
        if (payload.url) {
          setCurrentUrl(payload.url);
        }
        setConnected(true);
      } catch (err) {
        console.warn('[BrowserStream] Error parsing frame data:', err);
      }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [isOpen, sessionId]);

  // Send input helper
  const sendInput = useCallback(
    async (inputEvent: Record<string, any>, action?: string) => {
      if (!sessionId) return;
      try {
        const url = `/api/worker/sessions/${sessionId}/stream${action ? `?action=${action}` : ''}`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inputEvent),
        });
      } catch (err) {
        console.warn('[BrowserStream] Failed to send input:', err);
      }
    },
    [sessionId]
  );

  // Coordinate mapping from rendered image to remote 1920x1080 browser
  const getRemoteCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const x = Math.max(0, Math.min(1920, (clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(1080, (clientY - rect.top) * scaleY));
    return { x, y };
  }, []);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      e.preventDefault();
      const { x, y } = getRemoteCoordinates(e.clientX, e.clientY);
      sendInput({ type: 'mousedown', x, y, button: e.button === 2 ? 'right' : 'left' });
    },
    [getRemoteCoordinates, sendInput]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      e.preventDefault();
      const { x, y } = getRemoteCoordinates(e.clientX, e.clientY);
      sendInput({ type: 'mouseup', x, y, button: e.button === 2 ? 'right' : 'left' });
    },
    [getRemoteCoordinates, sendInput]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      e.preventDefault();
      const { x, y } = getRemoteCoordinates(e.clientX, e.clientY);
      sendInput({ type: 'click', x, y, button: e.button === 2 ? 'right' : 'left' });
    },
    [getRemoteCoordinates, sendInput]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLImageElement>) => {
      const { x, y } = getRemoteCoordinates(e.clientX, e.clientY);
      sendInput({ type: 'wheel', x, y, deltaX: e.deltaX, deltaY: e.deltaY });
    },
    [getRemoteCoordinates, sendInput]
  );

  // Touch handlers for mobile devices
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLImageElement>) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const { x, y } = getRemoteCoordinates(touch.clientX, touch.clientY);
        sendInput({
          type: 'touch',
          touchPoints: [{ x, y, id: 0 }],
        });
      }
    },
    [getRemoteCoordinates, sendInput]
  );

  // Keyboard text submit helper
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput) return;
    await sendInput({ type: 'type', text: textInput });
    setTextInput('');
  };

  const handleRefresh = async () => {
    await sendInput({}, 'refresh');
  };

  // Complete intervention
  const handleMarkResolved = async () => {
    setResolving(true);
    try {
      await fetch(`/api/auto-apply/interventions/${interventionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: 'completed' }),
      });
      onResolved();
      onClose();
    } catch (err) {
      console.error('[BrowserStream] Failed to resolve intervention:', err);
    } finally {
      setResolving(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: isFullscreen ? 0 : '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: isFullscreen ? '100vw' : '94vw',
          maxWidth: isFullscreen ? '100vw' : '1280px',
          height: isFullscreen ? '100vh' : '90vh',
          backgroundColor: '#09090B',
          border: isFullscreen ? 'none' : '1px solid #27272A',
          borderRadius: isFullscreen ? 0 : '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#18181B',
            borderBottom: '1px solid #27272A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                borderRadius: '9999px',
                backgroundColor: connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: connected ? '#4ade80' : '#f87171',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              <Radio size={12} className={connected ? 'animate-pulse' : ''} />
              {connected ? 'Live Cloud Browser' : 'Connecting...'}
            </div>
            <span
              style={{
                color: '#E4E4E7',
                fontSize: '14px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {portalName} Authentication
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              title="Refresh Page"
              style={{
                backgroundColor: '#27272A',
                color: '#FAFAFA',
                border: '1px solid #3F3F46',
                height: '32px',
                padding: '0 10px',
              }}
            >
              <RefreshCw size={14} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInputBar(!showInputBar)}
              title="Toggle Virtual Keyboard / Text Input"
              style={{
                backgroundColor: showInputBar ? '#3B82F6' : '#27272A',
                color: '#FAFAFA',
                border: '1px solid #3F3F46',
                height: '32px',
                padding: '0 10px',
              }}
            >
              <Keyboard size={14} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              style={{
                backgroundColor: '#27272A',
                color: '#FAFAFA',
                border: '1px solid #3F3F46',
                height: '32px',
                padding: '0 10px',
              }}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </Button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#A1A1AA',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* URL / Guide strip */}
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: '#0F0F12',
            borderBottom: '1px solid #27272A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#A1A1AA',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <ShieldCheck size={14} color="#10B981" />
            <span>Click directly on the screen below to sign in (e.g. &quot;Continue with Google&quot; or enter password).</span>
          </div>
          {currentUrl && (
            <span
              style={{
                color: '#71717A',
                maxWidth: '300px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentUrl}
            </span>
          )}
        </div>

        {/* Text Input Drawer for Mobile & Typing */}
        {showInputBar && (
          <form
            onSubmit={handleSendText}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1E1E24',
              borderBottom: '1px solid #3F3F46',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type text, code, or password here and press Enter to send to the remote browser..."
              style={{
                flex: 1,
                backgroundColor: '#09090B',
                border: '1px solid #3F3F46',
                borderRadius: '6px',
                padding: '6px 12px',
                color: '#FAFAFA',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <Button
              type="submit"
              size="sm"
              style={{ backgroundColor: '#2563EB', color: '#FFFFFF', height: '32px' }}
            >
              Send Keystrokes
            </Button>
          </form>
        )}

        {/* Live Stream Viewport */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'crosshair',
          }}
        >
          {frameSrc ? (
            <img
              ref={imgRef}
              src={frameSrc}
              alt="Live Cloud Browser Session"
              onClick={handleClick}
              onWheel={handleWheel}
              onTouchStart={handleTouchStart}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none',
              }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                color: '#A1A1AA',
              }}
            >
              <Radio size={32} className="animate-pulse" color="#60A5FA" />
              <p style={{ fontSize: '14px' }}>Connecting to cloud browser session...</p>
            </div>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#18181B',
            borderTop: '1px solid #27272A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#A1A1AA' }}>
            <CheckCircle2 size={16} color="#10B981" />
            <span>Once logged in, click resume. JAHQ will harvest the session cookies automatically.</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              style={{ backgroundColor: '#27272A', color: '#E4E4E7', border: '1px solid #3F3F46' }}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={handleMarkResolved}
              disabled={resolving}
              style={{
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {resolving ? 'Harvesting Session...' : "I'm Logged In — Resume"}
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
