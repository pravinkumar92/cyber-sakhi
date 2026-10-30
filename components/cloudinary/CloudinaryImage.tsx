"use client";
/**
 * components/cloudinary/CloudinaryImage.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a Cloudinary-hosted image with:
 *   • Responsive srcset via Cloudinary URL transformations
 *   • Blur-up placeholder using a tiny 20px wide version
 *   • Lazy loading by default
 *   • Optional overlay badge ("EVIDENCE", "CASE", etc.)
 *
 * Usage:
 *   <CloudinaryImage publicId="cyber-sakhi/cases/abc123/thumbnail" width={400} height={300} />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from "react";
import { clsx } from "clsx";

interface CloudinaryImageProps {
  /** Cloudinary public_id (without file extension) */
  publicId: string;
  /** Display width in px */
  width: number;
  /** Display height in px */
  height: number;
  alt?: string;
  className?: string;
  /** Optional badge overlaid on the image */
  badge?: string;
  /** Cloudinary cloud name — falls back to NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME */
  cloudName?: string;
  /** Additional Cloudinary transformation string, e.g. "e_blur_faces" */
  transformation?: string;
}

function buildCloudinaryUrl(
  cloudName: string,
  publicId: string,
  width: number,
  transformation?: string
): string {
  const base = `https://res.cloudinary.com/${cloudName}/image/authenticated`;
  const tx = [
    `w_${width}`,
    "c_fill",
    "q_auto",
    "f_auto",
    transformation,
  ]
    .filter(Boolean)
    .join(",");
  return `${base}/${tx}/${publicId}`;
}

export function CloudinaryImage({
  publicId,
  width,
  height,
  alt = "Cloudinary image",
  className,
  badge,
  cloudName,
  transformation,
}: CloudinaryImageProps) {
  const cloud =
    cloudName ||
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ||
    "";

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!cloud) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center bg-slate-800 text-slate-500 text-xs rounded-lg",
          className
        )}
        style={{ width, height }}
      >
        Cloudinary not configured
      </div>
    );
  }

  const src = buildCloudinaryUrl(cloud, publicId, width, transformation);
  const placeholderSrc = buildCloudinaryUrl(cloud, publicId, 20, transformation);

  if (error) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center bg-slate-800 text-slate-500 text-xs rounded-lg",
          className
        )}
        style={{ width, height }}
      >
        Image unavailable
      </div>
    );
  }

  return (
    <div
      className={clsx("relative overflow-hidden rounded-lg", className)}
      style={{ width, height }}
    >
      {/* Blur-up placeholder */}
      {!loaded && (
        <img
          src={placeholderSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover blur-md scale-110"
          style={{ filter: "blur(8px)" }}
        />
      )}

      {/* Main image */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={clsx(
          "w-full h-full object-cover transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Optional badge */}
      {badge && (
        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-black/60 text-emerald-300 border border-emerald-700/40">
          {badge}
        </span>
      )}
    </div>
  );
}
