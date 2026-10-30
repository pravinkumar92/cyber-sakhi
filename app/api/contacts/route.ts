/**
 * /api/contacts
 * GET  — list all trusted contacts for the authenticated user
 * POST — replace (upsert) the full contact list for the user
 * DELETE — remove a single contact by id
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  listTrustedContactsForUser,
  replaceTrustedContactsForUser,
} from "@/lib/db/trustedContacts";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const contacts = await listTrustedContactsForUser(session.user.id);
    return NextResponse.json({ contacts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load contacts." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { contacts?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.contacts)) {
    return NextResponse.json(
      { error: "contacts must be an array." },
      { status: 400 }
    );
  }

  // Validate and sanitize
  const clean = (body.contacts as Array<Record<string, unknown>>).map((c) => ({
    name: String(c.name || "").trim().slice(0, 100),
    relationship: String(c.relationship || "").trim().slice(0, 50),
    phone: String(c.phone || "").trim().slice(0, 20),
    email: String(c.email || "").trim().slice(0, 200),
    isVerified: Boolean(c.isVerified ?? c.is_verified ?? true),
    isPrimary: Boolean(c.isPrimary ?? c.is_primary ?? false),
    notifyWhatsApp: Boolean(c.notifyWhatsApp ?? c.notify_whatsapp ?? true),
    notifySms: Boolean(c.notifySms ?? c.notify_sms ?? true),
  }));

  if (clean.some((c) => !c.name)) {
    return NextResponse.json(
      { error: "Each contact must have a name." },
      { status: 400 }
    );
  }

  try {
    const saved = await replaceTrustedContactsForUser(session.user.id, clean);
    return NextResponse.json({ contacts: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save contacts." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("id");
  if (!contactId) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  try {
    const { error } = await getSupabaseServer()
      .from("trusted_contacts")
      .delete()
      .eq("id", contactId)
      .eq("user_id", session.user.id); // ownership check

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete contact." },
      { status: 500 }
    );
  }
}
