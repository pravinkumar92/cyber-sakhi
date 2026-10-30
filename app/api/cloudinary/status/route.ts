/**
 * GET /api/cloudinary/status
 * Returns safe (non-secret) Cloudinary configuration status.
 * Used by the Developer panel and system health checks.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getCloudinaryStatus } from "@/lib/cloudinary";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const status = getCloudinaryStatus();
  return NextResponse.json({
    cloudinary: {
      configured: status.configured,
      cloudName: status.cloudName,
      label: status.configured ? "Connected" : "Not configured",
      note: status.configured
        ? "Evidence blobs and companion images are stored on Cloudinary."
        : "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to enable.",
    },
  });
}
