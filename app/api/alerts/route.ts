/**
 * /api/alerts
 * GET  — return recent high-severity cases as alerts for the logged-in user
 * POST — analyze a raw email and generate threat alerts
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { analyzeEmail } from "@/lib/emailForensics";
import { generateAlerts } from "@/lib/alerts";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Return recent HIGH/CRITICAL cases as alerts
    const { data: cases, error } = await getSupabaseServer()
      .from("cases")
      .select(
        "id, case_number, title, threat_type, severity, status, created_at"
      )
      .eq("created_by", session.user.id)
      .in("severity", ["high", "critical"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw new Error(error.message);

    const alerts = (
      cases as Array<{
        id: string;
        case_number: string | null;
        title: string | null;
        threat_type: string | null;
        severity: string | null;
        status: string | null;
        created_at: string;
      }>
    ).map((c) => ({
      id: c.id,
      type: "case",
      severity: c.severity?.toUpperCase() || "HIGH",
      title: `${c.case_number || "Case"}: ${c.title || "Untitled"}`,
      description: `Threat type: ${c.threat_type || "Unknown"}. Status: ${c.status || "open"}.`,
      caseId: c.id,
      caseNumber: c.case_number,
      createdAt: c.created_at,
    }));

    return NextResponse.json({ alerts, userId: session.user.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to retrieve alerts",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { rawEmail } = body;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { error: "rawEmail field is required and must be a string." },
        { status: 400 }
      );
    }

    const analysisResult = await analyzeEmail(rawEmail.trim());
    const alerts = generateAlerts(analysisResult);

    return NextResponse.json({
      alerts,
      analysisId: analysisResult.id,
      threatLevel: analysisResult.threatLevel,
      threatScore: analysisResult.threatScore,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate alerts",
      },
      { status: 500 }
    );
  }
}
