-- ─────────────────────────────────────────────────────────────────────────────
-- ConfBuddy v3 migration: meeting intent classification
-- Run this in Supabase SQL Editor after supabase-v2-migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-classify every recorded meeting as either a plain 'interaction' or a
-- 'meaningful_interaction' (decision maker in the loop, real detail about the
-- prospect's IT landscape, an intent to set up a follow-up, etc.).
-- Stored on cb_meeting_notes alongside the rest of the AI-generated output.

ALTER TABLE cb_meeting_notes
  ADD COLUMN IF NOT EXISTS interaction_type text
    CHECK (interaction_type IN ('interaction', 'meaningful_interaction'));

ALTER TABLE cb_meeting_notes
  ADD COLUMN IF NOT EXISTS interaction_rationale text;
