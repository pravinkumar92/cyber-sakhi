/**
 * POST /api/cloudinary/sign
 * ─────────────────────────────────────────────────────────────────────────────
 * Generate a short-lived signed URL for an `authenticated` Cloudinary asset.
 *
 * Used when a user wants to download their encrypted evidence from Cloudinary.
 * The URL expires after 5 minutes. The caller then passes the signed URL to
 * the evidence decryption flow (the browser still needs the session key to
 * decrypt the AES-256-GCM ciphertext after download).
 *
 * Body: { publicId: string, resourceType?: "raw" | "image", expiresIn?: number }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { generateSignedUrl, isCloudinaryConfigured } from "@/lib/cloudinary";

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

  const body = await req.json().catch(() => ({}));
  const { publicId, resourceType = "raw", expiresIn = 300 } = body as {
    publicId?: string;
    resourceType?: "raw" | "image" | "video";
    expiresIn?: number;
  };

  if (!publicId || typeof publicId !== "string") {
    return NextResponse.json({ error: "publicId is required." }, { status: 400 });
  }

  // Security: ensure the publicId belongs to this user's evidence folder.
  // Structure: cyber-sakhi/evidence/<userId>/EV-XXXX-XXXXXXXX
  const isOwnedByUser =
    publicId.startsWith(`cyber-sakhi/evidence/${session.user.id}/`) ||
    publicId.startsWith(`cyber-sakhi/companion/${session.user.id}/`);

  if (!isOwnedByUser) {
    return NextResponse.json(
      { error: "Access denied to this resource." },
      { status: 403 }
    );
  }

  const ttl = Math.min(Math.max(Number(expiresIn) || 300, 60), 3600); // 1 min–1 hr
  const signedUrl = generateSignedUrl(publicId, resourceType, ttl);

  return NextResponse.json({ signedUrl, expiresIn: ttl });
}
