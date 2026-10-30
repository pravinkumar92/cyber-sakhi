-- ============================================================
-- Cyber Sakhi — Base Schema (Migration 00)
-- Apply this FIRST in the Supabase SQL Editor before all
-- other migrations. All tables are created with IF NOT EXISTS
-- so it is safe to re-run.
--
-- Apply order:
--   00_base_schema.sql                   ← THIS FILE
--   add_profile_password_hash.sql
--   add_profile_age_city_phone_sakhi_unique.sql
--   profile_welcome_email.sql
--   add_auth_recovery_tokens.sql
--   phase2_case_pipeline.sql
--   add_evidence_encryption_columns.sql
--   step3_hardening_evidence_lock_anchor.sql
--   phase3_audit_logs_and_case_search.sql
--   step4_sakhi_memory.sql
--   update_chain_of_custody_schema.sql
--   create_offender_network.sql
--   supabase_keepalive_heartbeat.sql
--   gov_identity_sessions.sql
--   gov_assignments_grants.sql
--   gov_totp_mfa.sql
--   gov_mfa_enrollment_recovery.sql
--   gov_admin_panel_schema.sql
--   gov_audit_extension.sql
--   gov_case_location_provenance.sql
--   gov_report_seals.sql
--   gov_research_staging.sql
--   gov_external_intelligence.sql
--   gov_external_iocs.sql
--   case_live_locations.sql
--   add_cloudinary_storage.sql
-- ============================================================

BEGIN;

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── 1. profiles ───────────────────────────────────────────────────────────────
-- Central user table. id mirrors auth.users(id) via Supabase Admin API.
-- All auth operations use the service role key (bypasses RLS).
CREATE TABLE IF NOT EXISTS public.profiles (
  id                    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL,
  full_name             TEXT        NULL,
  role                  TEXT        NOT NULL DEFAULT 'user'
                                    CHECK (role IN ('user', 'admin')),
  password_hash         TEXT        NULL,
  sakhi_number          TEXT        NULL,
  age                   TEXT        NULL,
  city                  TEXT        NULL,
  phone                 TEXT        NULL,
  welcome_email_sent_at TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles(email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_sakhi_number_unique
  ON public.profiles(sakhi_number)
  WHERE sakhi_number IS NOT NULL;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile (browser client).
DROP POLICY IF EXISTS profiles_owner_select ON public.profiles;
CREATE POLICY profiles_owner_select ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- All writes go through the service role (server-side). No insert/update
-- policy for the anon/authenticated roles.
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

-- ── 2. cases ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cases (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number TEXT        NULL,
  title       TEXT        NULL,
  description TEXT        NULL,
  threat_type TEXT        NULL,
  status      TEXT        NOT NULL DEFAULT 'open',
  severity    TEXT        NOT NULL DEFAULT 'unknown',
  created_by  UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_case_number
  ON public.cases(case_number)
  WHERE case_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cases_created_by
  ON public.cases(created_by);

CREATE INDEX IF NOT EXISTS idx_cases_status
  ON public.cases(status);

CREATE INDEX IF NOT EXISTS idx_cases_created_desc
  ON public.cases(created_at DESC);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO service_role;

-- ── 3. email_investigations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_investigations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID        NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  created_by          UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  source              TEXT        NULL,
  external_message_id TEXT        NULL,
  subject             TEXT        NULL,
  sender              TEXT        NULL,
  recipients          JSONB       NULL,
  risk_score          NUMERIC     NULL,
  verdict             TEXT        NULL,
  headers             JSONB       NULL,
  analysis            JSONB       NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_inv_created_by
  ON public.email_investigations(created_by);

CREATE INDEX IF NOT EXISTS idx_email_inv_case
  ON public.email_investigations(case_id);

ALTER TABLE public.email_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_investigations FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_investigations TO service_role;

-- ── 4. indicators ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.indicators (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id UUID        NULL REFERENCES public.email_investigations(id) ON DELETE CASCADE,
  case_id          UUID        NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  type             TEXT        NOT NULL,
  value            TEXT        NOT NULL,
  malicious        BOOLEAN     NULL,
  confidence       NUMERIC     NULL,
  source           TEXT        NULL,
  details          JSONB       NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_indicators_investigation
  ON public.indicators(investigation_id);

CREATE INDEX IF NOT EXISTS idx_indicators_case
  ON public.indicators(case_id);

ALTER TABLE public.indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indicators FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicators TO service_role;

-- ── 5. evidence ───────────────────────────────────────────────────────────────
-- All evidence content is AES-256-GCM encrypted client-side before upload.
-- The encrypted_content column stores base64-encoded ciphertext only.
CREATE TABLE IF NOT EXISTS public.evidence (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID        NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  uploaded_by       UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  title             TEXT        NOT NULL,
  filename          TEXT        NULL,
  file_path         TEXT        NULL,  -- legacy, always NULL
  mime_type         TEXT        NULL,
  file_size         BIGINT      NULL,
  sha256            TEXT        NULL,
  source            TEXT        NULL,
  description       TEXT        NULL,
  metadata          JSONB       NULL,
  encrypted_content TEXT        NULL,
  encryption_iv     TEXT        NULL,
  encrypted_size    BIGINT      NULL,
  category          TEXT        NULL,
  evidence_code     TEXT        NULL,
  -- Lock material (step3 hardening)
  lock_method       TEXT        NULL,
  lock_version      INTEGER     NULL,
  kdf               TEXT        NULL,
  kdf_salt          TEXT        NULL,
  kdf_iterations    INTEGER     NULL,
  kdf_params        JSONB       NULL,
  wrapped_key       TEXT        NULL,
  wrapped_key_iv    TEXT        NULL,
  verifier_wrapped  TEXT        NULL,
  verifier_iv       TEXT        NULL,
  verifier_sha      TEXT        NULL,
  lock_metadata     JSONB       NULL,
  blockchain_anchor_id UUID     NULL,  -- FK added after blockchain_anchors table
  -- Cloudinary storage
  cloudinary_url        TEXT    NULL,
  cloudinary_public_id  TEXT    NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_code
  ON public.evidence(evidence_code)
  WHERE evidence_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by
  ON public.evidence(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_evidence_case
  ON public.evidence(case_id);

CREATE INDEX IF NOT EXISTS idx_evidence_user_id_created_at
  ON public.evidence(uploaded_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_cloudinary_public_id
  ON public.evidence(cloudinary_public_id)
  WHERE cloudinary_public_id IS NOT NULL;

ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence TO service_role;

-- ── 6. chain_of_custody ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chain_of_custody (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id   UUID        NOT NULL REFERENCES public.evidence(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL,
  actor_id      UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes         TEXT        NULL,
  previous_hash TEXT        NULL,
  event_hash    TEXT        NULL,
  hash          TEXT        NULL,  -- legacy compatibility field
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chain_of_custody_evidence_id
  ON public.chain_of_custody(evidence_id);

CREATE INDEX IF NOT EXISTS idx_chain_of_custody_created_at
  ON public.chain_of_custody(created_at);

ALTER TABLE public.chain_of_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_of_custody FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chain_of_custody TO service_role;

-- ── 7. blockchain_anchors ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blockchain_anchors (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id           UUID        NULL REFERENCES public.evidence(id) ON DELETE CASCADE,
  anchor_type           TEXT        NOT NULL,
  anchor_version        INTEGER     NOT NULL DEFAULT 1,
  provider              TEXT        NULL,
  network_name          TEXT        NULL,
  chain_id              TEXT        NULL,
  tx_hash               TEXT        NULL,
  block_number          BIGINT      NULL,
  transaction_timestamp TIMESTAMPTZ NULL,
  anchored_digest       TEXT        NOT NULL,
  anchor_payload        TEXT        NULL,
  payload_metadata      JSONB       NULL,
  status                TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','confirmed','failed','unavailable','not_created','digest_mismatch')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  anchored_at           TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_evidence
  ON public.blockchain_anchors(evidence_id);

CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_tx
  ON public.blockchain_anchors(tx_hash);

ALTER TABLE public.blockchain_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_anchors FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blockchain_anchors TO service_role;

-- Back-fill FK from evidence -> blockchain_anchors now that both tables exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evidence_blockchain_anchor_id_fkey'
      AND conrelid = 'public.evidence'::regclass
  ) THEN
    ALTER TABLE public.evidence
      ADD CONSTRAINT evidence_blockchain_anchor_id_fkey
      FOREIGN KEY (blockchain_anchor_id)
      REFERENCES public.blockchain_anchors(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 8. reports ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID        NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  generated_by UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  title        TEXT        NOT NULL,
  report_type  TEXT        NULL,
  file_path    TEXT        NULL,
  report_data  JSONB       NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_generated_by
  ON public.reports(generated_by);

CREATE INDEX IF NOT EXISTS idx_reports_case
  ON public.reports(case_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO service_role;

-- ── 9. trusted_contacts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  relationship     TEXT        NULL,
  phone            TEXT        NULL,
  email            TEXT        NULL,
  is_verified      BOOLEAN     NOT NULL DEFAULT false,
  is_primary       BOOLEAN     NOT NULL DEFAULT false,
  notify_whatsapp  BOOLEAN     NOT NULL DEFAULT false,
  notify_sms       BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user
  ON public.trusted_contacts(user_id);

ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_contacts FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_contacts TO service_role;

-- ── 10. auth_recovery_tokens ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_recovery_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_recovery_tokens_hash
  ON public.auth_recovery_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_auth_recovery_tokens_profile
  ON public.auth_recovery_tokens(profile_id);

-- ── 11. cases — Cloudinary thumbnail columns ──────────────────────────────────
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS thumbnail_url       TEXT NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_public_id TEXT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
