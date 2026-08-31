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
  Zap,
  ZoomIn,
  ZoomOut,
  Focus,
  Eye,
  EyeOff,
  RotateCcw,
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
  const [isTypingActive, setIsTypingActive] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1.35); // Defaults to Form Focus (135%) to hide empty browser margins
  const [focusMode, setFocusMode] = useState<boolean>(true); // Defaults to Page Only mode to show only page body

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // Trigger brief visual indicator for user typing activity
  const triggerTypingIndicator = useCallback(() => {
    setIsTypingActive(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsTypingActive(false);
    }, 450);
  }, []);

  // Coordinate mapping from rendered image to remote 1920x1080 browser
  const getRemoteCoordinates = useCallback((clientX: number, clientY: number) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
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
      viewportRef.current?.focus();
      const { x, y } = getRemoteCoordinates(e.clientX, e.clientY);
      sendInput({ type: 'click', x, y, button: e.button === 2 ? 'right' : 'left' });
    },
    [getRemoteCoordinates, sendInput]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLImageElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoomLevel((prev) => Math.max(1.0, Math.min(2.5, Number((prev + delta).toFixed(2)))));
        return;
      }
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

  // Global physical keyboard capture for direct typing
  useEffect(() => {
    if (!isOpen || !connected) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // If user is typing inside our text input bar or another local modal input, ignore
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.dataset.streamCapture) {
        return;
      }

      // Allow browser dev tools and reload shortcuts
      if (
        e.key === 'F12' ||
        (e.key === 'r' && (e.metaKey || e.ctrlKey)) ||
        (e.key === 'I' && (e.metaKey || e.ctrlKey) && e.altKey)
      ) {
        return;
      }

      triggerTypingIndicator();

      // Handle keyboard shortcuts (Ctrl+A, Ctrl+C, Ctrl+V, etc.)
      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z', 'y'].includes(e.key.toLowerCase())) {
        if (e.key.toLowerCase() !== 'v') {
          sendInput({
            type: 'shortcut',
            key: e.key,
            ctrl: e.ctrlKey,
            meta: e.metaKey,
            shift: e.shiftKey,
            alt: e.altKey,
          });
        }
        // Let paste handler handle 'v'
        return;
      }

      // Prevent default navigation for stream typing keys
      const navigationKeys = [
        'Backspace',
        'Tab',
        'Enter',
        'Space',
        ' ',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Delete',
        'PageUp',
        'PageDown',
        'Home',
        'End',
      ];
      if (navigationKeys.includes(e.key)) {
        e.preventDefault();
      }

      sendInput({
        type: 'keydown',
        key: e.key,
        code: e.code,
        text: e.key.length === 1 ? e.key : undefined,
      });
    };

    const handleWindowKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.dataset.streamCapture) {
        return;
      }
      sendInput({
        type: 'keyup',
        key: e.key,
        code: e.code,
      });
    };

    const handleWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.dataset.streamCapture) {
        return;
      }
      const pastedText = e.clipboardData?.getData('text');
      if (pastedText) {
        e.preventDefault();
        triggerTypingIndicator();
        sendInput({ type: 'paste', text: pastedText });
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('keyup', handleWindowKeyUp);
    window.addEventListener('paste', handleWindowPaste);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('keyup', handleWindowKeyUp);
      window.removeEventListener('paste', handleWindowPaste);
    };
  }, [isOpen, connected, sendInput, triggerTypingIndicator]);

  // Keyboard text submit helper for virtual input bar
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput) return;
    triggerTypingIndicator();
    await sendInput({ type: 'type', text: textInput });
    setTextInput('');
  };

  const handleRefresh = async () => {
    await sendInput({}, 'refresh');
  };

  // Zoom helpers
  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(2.5, Number((prev + 0.15).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(1.0, Number((prev - 0.15).toFixed(2))));
  };

  const handleResetZoom = () => {
    setZoomLevel(1.0);
  };

  const handleFocusFormZoom = () => {
    setZoomLevel(1.35);
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
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
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
          position: 'relative',
        }}
      >
        {/* Header Bar */}
        {!focusMode && (
          <div
            style={{
              padding: '10px 16px',
              backgroundColor: '#18181B',
              borderBottom: '1px solid #27272A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
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
                {connected ? 'Live Session' : 'Connecting...'}
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
                {portalName}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {/* Keyboard Status Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: isTypingActive ? 'rgba(59, 130, 246, 0.25)' : 'rgba(39, 39, 42, 0.8)',
                  border: isTypingActive ? '1px solid #3B82F6' : '1px solid #3F3F46',
                  color: isTypingActive ? '#93C5FD' : '#A1A1AA',
                  fontSize: '11px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                title="Physical keyboard input is active. Click and type directly."
              >
                <Keyboard size={12} color={isTypingActive ? '#60A5FA' : '#A1A1AA'} />
                <span>{isTypingActive ? 'Transmitting Key...' : 'Keyboard Ready'}</span>
              </div>

              {/* Zoom Controls */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: '#27272A',
                  border: '1px solid #3F3F46',
                  borderRadius: '6px',
                  padding: '2px',
                }}
              >
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 1.0}
                  title="Zoom Out"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: zoomLevel <= 1.0 ? '#52525B' : '#E4E4E7',
                    padding: '4px 6px',
                    cursor: zoomLevel <= 1.0 ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <ZoomOut size={13} />
                </button>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#FAFAFA',
                    padding: '0 4px',
                    minWidth: '38px',
                    textAlign: 'center',
                  }}
                >
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 2.5}
                  title="Zoom In"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: zoomLevel >= 2.5 ? '#52525B' : '#E4E4E7',
                    padding: '4px 6px',
                    cursor: zoomLevel >= 2.5 ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <ZoomIn size={13} />
                </button>
              </div>

              {/* Focus Form Preset */}
              <Button
                variant="outline"
                size="sm"
                onClick={zoomLevel === 1.35 ? handleResetZoom : handleFocusFormZoom}
                title={zoomLevel === 1.35 ? 'Reset to Full Screen (100%)' : 'Zoom directly to centered page form (135%)'}
                style={{
                  backgroundColor: zoomLevel === 1.35 ? 'rgba(59, 130, 246, 0.2)' : '#27272A',
                  color: zoomLevel === 1.35 ? '#60A5FA' : '#FAFAFA',
                  border: zoomLevel === 1.35 ? '1px solid #3B82F6' : '1px solid #3F3F46',
                  height: '30px',
                  padding: '0 8px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Focus size={13} />
                <span>{zoomLevel === 1.35 ? '100% Fit' : 'Focus Form'}</span>
              </Button>

              {/* Page Only / Hide Chrome Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFocusMode(true)}
                title="Hide top bars to show only the page body"
                style={{
                  backgroundColor: '#27272A',
                  color: '#FAFAFA',
                  border: '1px solid #3F3F46',
                  height: '30px',
                  padding: '0 8px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <EyeOff size={13} />
                <span>Page Only</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                title="Refresh Page"
                style={{
                  backgroundColor: '#27272A',
                  color: '#FAFAFA',
                  border: '1px solid #3F3F46',
                  height: '30px',
                  padding: '0 8px',
                }}
              >
                <RefreshCw size={13} />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowInputBar(!showInputBar)}
                title="Toggle Virtual Text Input Drawer"
                style={{
                  backgroundColor: showInputBar ? '#3B82F6' : '#27272A',
                  color: '#FAFAFA',
                  border: '1px solid #3F3F46',
                  height: '30px',
                  padding: '0 8px',
                }}
              >
                <Zap size={13} />
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
                  height: '30px',
                  padding: '0 8px',
                }}
              >
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
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
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Floating Mini Controls when Page Only Mode is active */}
        {focusMode && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(24, 24, 27, 0.92)',
              border: '1px solid #3F3F46',
              borderRadius: '8px',
              padding: '4px 8px',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.6)',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: isTypingActive ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
                color: isTypingActive ? '#93C5FD' : '#A1A1AA',
                fontSize: '11px',
                fontWeight: 500,
              }}
            >
              <Keyboard size={12} color={isTypingActive ? '#60A5FA' : '#A1A1AA'} />
              <span>{isTypingActive ? 'Typing...' : 'Keyboard Ready'}</span>
            </div>

            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#E4E4E7',
                padding: '3px 5px',
                cursor: 'pointer',
              }}
            >
              <ZoomOut size={13} />
            </button>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#FAFAFA' }}>
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#E4E4E7',
                padding: '3px 5px',
                cursor: 'pointer',
              }}
            >
              <ZoomIn size={13} />
            </button>

            <button
              onClick={() => setFocusMode(false)}
              title="Show Full Header & Controls"
              style={{
                backgroundColor: '#27272A',
                border: '1px solid #3F3F46',
                borderRadius: '4px',
                color: '#FAFAFA',
                padding: '3px 6px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Eye size={12} />
              <span>Show Chrome</span>
            </button>

            <button
              onClick={onClose}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#A1A1AA',
                cursor: 'pointer',
                padding: '3px',
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* URL / Guide strip */}
        {!focusMode && (
          <div
            style={{
              padding: '6px 16px',
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
              <span>Click inside any field and type normally on your keyboard, or paste directly.</span>
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
        )}

        {/* Text Input Drawer for Quick Pasting & Mobile Typing */}
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
              placeholder="Paste email, password, or 2FA code here and press Enter to send..."
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
          ref={viewportRef}
          tabIndex={0}
          style={{
            flex: 1,
            backgroundColor: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'auto',
            cursor: 'crosshair',
            outline: 'none',
          }}
        >
          {frameSrc ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <img
                ref={imgRef}
                src={frameSrc}
                alt="Live Cloud Browser Session"
                onClick={handleClick}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'none',
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out',
                }}
              />
            </div>
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
            padding: '10px 16px',
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
              {resolving ? 'Harvesting Session...' : 'I am Logged In, Resume'}
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
