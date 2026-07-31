"use client";

import React, { useState, useEffect } from "react";
import { User as UserIcon } from "lucide-react";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  showIconFallback?: boolean;
}

export function UserAvatar({
  src,
  name,
  email,
  size = 32,
  className,
  style,
  showIconFallback = false,
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);

  // Reset error state if src changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  const initial = (name?.trim() || email?.trim() || "U")[0]?.toUpperCase() || "U";
  const displaySrc = src?.trim();

  if (displaySrc && !hasError) {
    return (
      <img
        src={displaySrc}
        alt={name || "User Avatar"}
        onError={() => setHasError(true)}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          ...style,
        }}
        className={className}
      />
    );
  }

  if (showIconFallback) {
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.05)",
          border: "1px solid var(--border-glass, rgba(255, 255, 255, 0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          ...style,
        }}
        className={className}
      >
        <UserIcon size={Math.round(size * 0.45)} color="var(--text-secondary, #9ca3af)" />
      </div>
    );
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: "50%",
        background: "var(--accent-primary, #3b82f6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontWeight: 600,
        fontSize: `${Math.max(12, Math.round(size * 0.42))}px`,
        flexShrink: 0,
        userSelect: "none",
        ...style,
      }}
      className={className}
    >
      {initial}
    </div>
  );
}
