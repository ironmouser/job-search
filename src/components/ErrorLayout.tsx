"use client";

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Home, RefreshCw, AlertTriangle } from 'lucide-react';
import { getS3AssetUrl } from '@/lib/s3';

interface ErrorLayoutProps {
  statusCode?: number | string;
  title?: string;
  message?: string;
  onRetry?: () => void;
  showHomeButton?: boolean;
}

export default function ErrorLayout({
  statusCode = 404,
  title = 'Page Not Found',
  message = "We couldn't find the page you were looking for. It may have been moved or no longer exists.",
  onRetry,
  showHomeButton = true,
}: ErrorLayoutProps) {
  const s3ImageUrl = getS3AssetUrl('lost.gif');
  const [imgSrc, setImgSrc] = useState(s3ImageUrl);

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '560px',
          width: '100%',
          padding: '2.5rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
          backdropFilter: 'none',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
          borderRadius: '16px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#ef4444',
            fontSize: '1.75rem',
            fontWeight: 800,
          }}
        >
          {statusCode === 404 ? '404' : <AlertTriangle size={32} />}
        </div>

        <div>
          <h1
            style={{
              fontSize: '1.875rem',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              marginBottom: '0.5rem',
            }}
          >
            {title}
          </h1>
          <p
            style={{
              color: 'var(--text-secondary, #6b7280)',
              fontSize: '1rem',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {message}
          </p>
        </div>

        {/* S3 Image below error message */}
        <div
          style={{
            width: '100%',
            maxWidth: '380px',
            margin: '0.5rem 0',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.12)',
            position: 'relative',
            aspectRatio: '4 / 3',
          }}
        >
          <img
            src={imgSrc}
            alt="Page Error - Lost"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={() => {
              // Fallback to local public file if S3 URL is inaccessible
              if (imgSrc !== '/lost.gif') {
                setImgSrc('/lost.gif');
              }
            }}
          />
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: '0.5rem',
          }}
        >
          {onRetry && (
            <button className="btn-primary" onClick={onRetry}>
              <RefreshCw size={18} /> Try Again
            </button>
          )}

          {showHomeButton && (
            <Link href="/dashboard" className="btn-primary" style={{ textDecoration: 'none' }}>
              <Home size={18} /> Back to Dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
