/**
 * GET /api/dashboard
 * Returns aggregated stats for the logged-in user's dashboard:
 * cases, evidence, trusted contacts counts — all from the database.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const sb = getSupabaseServer();

    // Run all queries in parallel
    const [casesRes, evidenceRes, contactsRes, recentCasesRes] =
      await Promise.all([
        // Total cases count
        sb
          .from("cases")
          .select("id", { count: "exact", head: true })
          .eq("created_by", userId),

        // Total evidence count + encrypted count
        sb
          .from("evidence")
          .select("id, encrypted_content, created_at, category, cloudinary_url", {
            count: "exact",
          })
          .eq("uploaded_by", userId)
          .order("created_at", { ascending: false })
          .limit(50),

        // Trusted contacts
        sb
          .from("trusted_contacts")
          .select("id, is_verified, is_primary", { count: "exact" })
          .eq("user_id", userId),

        // Recent 5 cases for activity feed
        sb
          .from("cases")
          .select("id, case_number, title, status, severity, threat_type, created_at, updated_at")
          .eq("created_by", userId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    const totalCases = casesRes.count ?? 0;
    const evidenceRows = (evidenceRes.data ?? []) as Array<{
      id: string;
      encrypted_content: string | null;
      created_at: string;
      category: string | null;
      cloudinary_url: string | null;
    }>;
    const totalEvidence = evidenceRes.count ?? evidenceRows.length;
    const encryptedEvidence = evidenceRows.filter(
      (e) => e.encrypted_content || e.cloudinary_url
    ).length;

    const contactRows = (contactsRes.data ?? []) as Array<{
      id: string;
      is_verified: boolean;
      is_primary: boolean;
    }>;
    const totalContacts = contactsRes.count ?? contactRows.length;
    const verifiedContacts = contactRows.filter((c) => c.is_verified).length;
    const hasPrimary = contactRows.some((c) => c.is_primary && c.is_verified);

    // Category distribution from evidence
    const categoryMap: Record<string, number> = {};
    for (const e of evidenceRows) {
      const cat = e.category || "OTHER";
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    }

    // Recent cases for activity feed
    const recentCases = (
      recentCasesRes.data ?? []
    ) as Array<{
      id: string;
      case_number: string | null;
      title: string | null;
      status: string | null;
      severity: string | null;
      threat_type: string | null;
      created_at: string;
      updated_at: string | null;
    }>;

    // Severity distribution from all recent evidence + cases
    const severityCounts: Record<string, number> = {};
    for (const c of recentCases) {
      const s = c.severity?.toUpperCase() || "UNKNOWN";
      severityCounts[s] = (severityCounts[s] || 0) + 1;
    }

    return NextResponse.json({
      stats: {
        totalCases,
        totalEvidence,
        encryptedEvidence,
        cloudinaryBacked: evidenceRows.filter((e) => e.cloudinary_url).length,
        totalContacts,
        verifiedContacts,
        hasPrimary,
      },
      recentCases,
      categoryDistribution: categoryMap,
      severityDistribution: severityCounts,
      user: {
        id: userId,
        name: session.user.name,
        email: session.user.email,
        sakhiNumber: session.user.sakhiNumber,
        role: session.user.role,
      },
    });
  } catch (error) {
    console.error("[Dashboard API] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load dashboard data.",
      },
      { status: 500 }
    );
  }
}
