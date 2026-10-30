/**
 * POST /api/cloudinary/upload
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified Cloudinary upload endpoint for Cyber Sakhi.
 *
 * Supports three upload types controlled by the `type` field:
 *   "evidence"   – AES-256-GCM encrypted evidence blob (raw, authenticated)
 *   "companion"  – Companion chat image for Gemini analysis (image, public)
 *   "thumbnail"  – Case thumbnail with face-blur (image, authenticated)
 *
 * All uploads require an authenticated NextAuth session.
 * Returns a `cloudinaryUrl` (secure_url) and `publicId` for DB storage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  uploadEvidenceToCloudinary,
  uploadCompanionImageToCloudinary,
  uploadCaseThumbnailToCloudinary,
  isCloudinaryConfigured,
} from "@/lib/cloudinary";

const MAX_COMPANION_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_EVIDENCE_BYTES        = 25 * 1024 * 1024;  // 25 MB (matches evidence locker)
const MAX_THUMBNAIL_BYTES       =  5 * 1024 * 1024;  //  5 MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isCloudinaryConfigured()) {
    return NextResponse.json(
      { error: "Cloudinary is not configured on this server." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { type, base64Data, mimeType, evidenceCode, caseId } = body as {
    type?: string;
    base64Data?: string;
    mimeType?: string;
    evidenceCode?: string;
    caseId?: string;
  };

  if (!type || !base64Data || !mimeType) {
    return NextResponse.json(
      { error: "Missing required fields: type, base64Data, mimeType." },
      { status: 400 }
    );
  }

  // Estimate byte size from base64 length
  const estimatedBytes = Math.ceil((base64Data.length * 3) / 4);

  try {
    switch (type) {
      // ── Evidence encrypted blob ──────────────────────────────────────────
      case "evidence": {
        if (!evidenceCode) {
          return NextResponse.json(
            { error: "evidenceCode is required for evidence uploads." },
            { status: 400 }
          );
        }
        if (estimatedBytes > MAX_EVIDENCE_BYTES) {
          return NextResponse.json(
            { error: "Encrypted evidence payload exceeds the 25 MB limit." },
            { status: 413 }
          );
        }

        const result = await uploadEvidenceToCloudinary(
          base64Data,
          session.user.id,
          evidenceCode,
          mimeType
        );

        return NextResponse.json({
          cloudinaryUrl: result.secureUrl,
          publicId: result.publicId,
          bytes: result.bytes,
          createdAt: result.createdAt,
          type: "evidence",
        });
      }

      // ── Companion chat image ─────────────────────────────────────────────
      case "companion": {
        if (!mimeType.startsWith("image/")) {
          return NextResponse.json(
            { error: "Only image/* MIME types are supported for companion uploads." },
            { status: 400 }
          );
        }
        if (estimatedBytes > MAX_COMPANION_IMAGE_BYTES) {
          return NextResponse.json(
            { error: "Image exceeds the 10 MB limit for companion chat." },
            { status: 413 }
          );
        }

        const result = await uploadCompanionImageToCloudinary(
          base64Data,
          mimeType,
          session.user.id
        );

        return NextResponse.json({
          cloudinaryUrl: result.secureUrl,
          publicId: result.publicId,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          type: "companion",
        });
      }

      // ── Case thumbnail ───────────────────────────────────────────────────
      case "thumbnail": {
        if (!caseId) {
          return NextResponse.json(
            { error: "caseId is required for thumbnail uploads." },
            { status: 400 }
          );
        }
        if (!mimeType.startsWith("image/")) {
          return NextResponse.json(
            { error: "Only image/* MIME types are supported for thumbnails." },
            { status: 400 }
          );
        }
        if (estimatedBytes > MAX_THUMBNAIL_BYTES) {
          return NextResponse.json(
            { error: "Thumbnail image exceeds the 5 MB limit." },
            { status: 413 }
          );
        }

        const result = await uploadCaseThumbnailToCloudinary(
          base64Data,
          mimeType,
          caseId
        );

        return NextResponse.json({
          cloudinaryUrl: result.secureUrl,
          publicId: result.publicId,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          type: "thumbnail",
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown upload type: "${type}". Use "evidence", "companion", or "thumbnail".` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[Cloudinary Upload] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Cloudinary upload failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
