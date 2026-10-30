/**
 * lib/cloudinary.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cyber Sakhi — Cloudinary integration layer
 *
 * All evidence file assets (AES-256-GCM encrypted blobs) and companion chat
 * images are stored on Cloudinary. No plaintext evidence bytes ever reach
 * Cloudinary — only ciphertext. The encryption key stays client-side only.
 *
 * Environment variables required (server-only, never NEXT_PUBLIC_):
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Optional:
 *   CLOUDINARY_UPLOAD_PRESET   – unsigned preset name for client-side uploads
 *   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME – for client-side Image component
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { v2 as cloudinary } from "cloudinary";

// ── Configuration ─────────────────────────────────────────────────────────────

let configured = false;

function configureCloudinary(): void {
  if (configured) return;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    // Soft-fail: Cloudinary is optional at boot.
    // Callers check isCloudinaryConfigured() before using.
    return;
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  configured = true;
}

export function isCloudinaryConfigured(): boolean {
  configureCloudinary();
  return configured;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CloudinaryUploadResult {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface CloudinaryDeleteResult {
  result: string; // "ok" | "not found"
}

// ── Evidence uploads ──────────────────────────────────────────────────────────

/**
 * Upload an AES-256-GCM encrypted evidence blob to Cloudinary.
 *
 * - Stored under `cyber-sakhi/evidence/<userId>/` folder.
 * - Resource type `raw` because the payload is not a native image/video.
 * - Tagged with `evidence`, `encrypted`, and the evidence code.
 * - Access mode `authenticated` — no public URL is issued; downloads require
 *   a signed URL generated server-side.
 *
 * @param encryptedBase64  Base64-encoded AES-256-GCM ciphertext
 * @param userId           Uploader's Supabase profile ID
 * @param evidenceCode     Human-facing vault reference (e.g. EV-2026-XXXXXXXX)
 * @param mimeType         Original MIME type hint stored as metadata
 */
export async function uploadEvidenceToCloudinary(
  encryptedBase64: string,
  userId: string,
  evidenceCode: string,
  mimeType: string
): Promise<CloudinaryUploadResult> {
  configureCloudinary();
  if (!configured) throw new Error("Cloudinary is not configured.");

  const dataUri = `data:application/octet-stream;base64,${encryptedBase64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "raw",
    folder: `cyber-sakhi/evidence/${userId}`,
    public_id: evidenceCode.replace(/[^a-zA-Z0-9_-]/g, "_"),
    use_filename: false,
    overwrite: false,
    type: "authenticated",           // requires signed URL for access
    tags: ["evidence", "encrypted", evidenceCode],
    context: {
      evidence_code: evidenceCode,
      original_mime: mimeType,
      encrypted: "true",
      encryption: "AES-256-GCM",
      app: "cyber-sakhi",
    },
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    resourceType: result.resource_type,
    format: result.format ?? "bin",
    bytes: result.bytes,
    createdAt: result.created_at,
  };
}

// ── Companion chat image uploads ──────────────────────────────────────────────

/**
 * Upload a companion chat image (screenshot, threat screenshot, etc.) to
 * Cloudinary for temporary Gemini analysis context.
 *
 * - Stored under `cyber-sakhi/companion/<userId>/` folder.
 * - Auto-tagged for content moderation and categorisation.
 * - Transformation: auto quality + format, strip EXIF (privacy).
 * - Returns a secure URL suitable for passing to Gemini's vision API.
 *
 * @param base64Data   Raw base64 (no data URI prefix)
 * @param mimeType     Image MIME type (image/jpeg, image/png, image/webp)
 * @param userId       Authenticated user's profile ID
 */
export async function uploadCompanionImageToCloudinary(
  base64Data: string,
  mimeType: string,
  userId: string
): Promise<CloudinaryUploadResult> {
  configureCloudinary();
  if (!configured) throw new Error("Cloudinary is not configured.");

  const dataUri = `data:${mimeType};base64,${base64Data}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "image",
    folder: `cyber-sakhi/companion/${userId}`,
    use_filename: false,
    overwrite: false,
    type: "upload",                   // publicly reachable URL (no PII — just screenshots)
    tags: ["companion", "chat", "threat-analysis"],
    transformation: [
      { quality: "auto", fetch_format: "auto" },
      { flags: "strip_profile" },      // strip EXIF for privacy
    ],
    context: {
      user_id: userId,
      app: "cyber-sakhi",
      purpose: "companion-chat-analysis",
    },
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    resourceType: result.resource_type,
    format: result.format ?? "jpg",
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    createdAt: result.created_at,
  };
}

// ── Case thumbnail uploads ────────────────────────────────────────────────────

/**
 * Upload a case thumbnail or evidence screenshot as a visual reference.
 *
 * - Stored under `cyber-sakhi/cases/<caseId>/`.
 * - Faces are blurred for privacy (Cloudinary AI).
 * - Returns a secure URL stored alongside the case record.
 *
 * @param base64Data   Raw base64 image data
 * @param mimeType     Image MIME type
 * @param caseId       Case UUID
 */
export async function uploadCaseThumbnailToCloudinary(
  base64Data: string,
  mimeType: string,
  caseId: string
): Promise<CloudinaryUploadResult> {
  configureCloudinary();
  if (!configured) throw new Error("Cloudinary is not configured.");

  const dataUri = `data:${mimeType};base64,${base64Data}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: "image",
    folder: `cyber-sakhi/cases/${caseId}`,
    use_filename: false,
    overwrite: true,
    type: "authenticated",
    tags: ["case", "thumbnail"],
    transformation: [
      { width: 800, height: 600, crop: "limit" },
      { effect: "blur_faces" },        // AI face blur for victim privacy
      { quality: "auto", fetch_format: "auto" },
      { flags: "strip_profile" },
    ],
    context: {
      case_id: caseId,
      app: "cyber-sakhi",
      purpose: "case-thumbnail",
    },
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    resourceType: result.resource_type,
    format: result.format ?? "jpg",
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    createdAt: result.created_at,
  };
}

// ── Signed URL generation (for authenticated resources) ───────────────────────

/**
 * Generate a short-lived signed URL for an `authenticated` Cloudinary asset.
 * Use this to serve encrypted evidence download links — they expire after
 * `expiresInSeconds` (default 300 = 5 minutes).
 */
export function generateSignedUrl(
  publicId: string,
  resourceType: "raw" | "image" | "video" = "raw",
  expiresInSeconds = 300
): string {
  configureCloudinary();
  if (!configured) throw new Error("Cloudinary is not configured.");

  return cloudinary.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    secure: true,
  });
}

// ── Delete asset ──────────────────────────────────────────────────────────────

/**
 * Permanently delete a Cloudinary asset.
 * Called when evidence is deleted from the locker.
 */
export async function deleteFromCloudinary(
  publicId: string,
  resourceType: "raw" | "image" | "video" = "raw"
): Promise<CloudinaryDeleteResult> {
  configureCloudinary();
  if (!configured) return { result: "not configured" };

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    invalidate: true,
  });

  return { result: result.result };
}

// ── Status helper ─────────────────────────────────────────────────────────────

/**
 * Returns a safe (non-secret) status object for /api/ai/status style routes.
 */
export function getCloudinaryStatus(): {
  configured: boolean;
  cloudName: string | null;
} {
  return {
    configured: isCloudinaryConfigured(),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? null,
  };
}
