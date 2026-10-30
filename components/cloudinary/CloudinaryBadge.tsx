"use client";
/**
 * components/cloudinary/CloudinaryBadge.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Small badge shown on evidence cards to indicate Cloudinary cloud backup
 * status. Renders nothing if Cloudinary is not backed up.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { Cloud, CloudOff } from "lucide-react";
import { clsx } from "clsx";

interface CloudinaryBadgeProps {
  /** Whether this evidence item has a Cloudinary URL */
  cloudinaryBacked: boolean;
  className?: string;
  /** Show full label or icon only */
  compact?: boolean;
}

export function CloudinaryBadge({
  cloudinaryBacked,
  className,
  compact = false,
}: CloudinaryBadgeProps) {
  if (!cloudinaryBacked) {
    return compact ? null : (
      <span
        className={clsx(
          "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
          "bg-slate-800/70 text-slate-500 border border-slate-700/40",
          className
        )}
        title="Stored in database only — Cloudinary not configured"
      >
        <CloudOff className="w-3 h-3" />
        {!compact && <span>DB only</span>}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
        "bg-blue-950/70 text-blue-300 border border-blue-700/40",
        className
      )}
      title="Encrypted backup stored on Cloudinary"
    >
      <Cloud className="w-3 h-3" />
      {!compact && <span>Cloud backup</span>}
    </span>
  );
}
