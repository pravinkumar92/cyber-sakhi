-- ============================================================
-- Cyber Sakhi — Cloudinary Storage Integration
-- Purpose:
--   Add Cloudinary URL and public_id columns to the evidence
--   table so encrypted evidence blobs stored on Cloudinary can
--   be retrieved and deleted without scanning all rows.
--
-- Safety:
--   Additive and idempotent (IF NOT EXISTS / nullable columns).
--   No data is dropped. Existing rows get NULL for both columns,
--   meaning they continue to be served from encrypted_content
--   in the database (the fallback path in lib/db/evidence.ts).
-- ============================================================

-- Secure URL returned by Cloudinary after upload.
-- NULL = evidence stored in DB only (encrypted_content column).
-- Non-NULL = evidence blob is also on Cloudinary (dual-stored).
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS cloudinary_url TEXT NULL;

COMMENT ON COLUMN public.evidence.cloudinary_url IS
  'Cloudinary secure_url for the encrypted evidence blob. NULL = DB-only storage. Never a plaintext file URL.';

-- Cloudinary public_id needed to generate signed download URLs
-- and to delete the asset when evidence is deleted from the locker.
ALTER TABLE public.evidence
  ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT NULL;

COMMENT ON COLUMN public.evidence.cloudinary_public_id IS
  'Cloudinary public_id (e.g. cyber-sakhi/evidence/<userId>/EV-XXXX-XXXXXXXX). Used for signed URL generation and deletion.';

-- Index for fast lookup when generating signed download URLs.
CREATE INDEX IF NOT EXISTS idx_evidence_cloudinary_public_id
  ON public.evidence(cloudinary_public_id)
  WHERE cloudinary_public_id IS NOT NULL;

-- Also add thumbnail_url to cases for Cloudinary-hosted case thumbnails.
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NULL;

COMMENT ON COLUMN public.cases.thumbnail_url IS
  'Cloudinary secure_url for the case thumbnail (face-blurred image). NULL = no thumbnail.';

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS thumbnail_public_id TEXT NULL;

COMMENT ON COLUMN public.cases.thumbnail_public_id IS
  'Cloudinary public_id for the case thumbnail, used for deletion.';
