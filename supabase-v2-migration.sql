-- ─────────────────────────────────────────────────────────────────────────────
-- ConfBuddy v2 migration: notifications + team conferences
-- Run this in Supabase SQL Editor after supabase-migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Notifications table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cb_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text        NOT NULL DEFAULT 'info',   -- 'processing' | 'success' | 'error' | 'info'
  title       text        NOT NULL,
  body        text,
  read        boolean     NOT NULL DEFAULT false,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cb_notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users manage own notifications" ON cb_notifications
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. Join codes for conferences ────────────────────────────────────────────
ALTER TABLE cb_conferences ADD COLUMN IF NOT EXISTS join_code text;

-- Backfill existing conferences
UPDATE cb_conferences
SET    join_code = upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6))
WHERE  join_code IS NULL;

-- Unique index (allow nulls)
CREATE UNIQUE INDEX IF NOT EXISTS cb_conferences_join_code_key
  ON cb_conferences (join_code)
  WHERE join_code IS NOT NULL;

-- ── 3. Auto-insert owner into cb_conference_members on conference create ─────
-- Trigger: when a conference is created, add the creator as 'owner'
CREATE OR REPLACE FUNCTION fn_add_conference_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO cb_conference_members (conference_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner')
  ON CONFLICT (conference_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_conference_owner ON cb_conferences;
CREATE TRIGGER trg_add_conference_owner
  AFTER INSERT ON cb_conferences
  FOR EACH ROW EXECUTE FUNCTION fn_add_conference_owner();

-- Backfill existing conferences into cb_conference_members
INSERT INTO cb_conference_members (conference_id, user_id, role)
SELECT id, user_id, 'owner'
FROM   cb_conferences
ON CONFLICT (conference_id, user_id) DO NOTHING;

-- ── 4. RLS: conference members can read shared conference data ───────────────
-- cb_conferences: members can read
DO $$ BEGIN
  CREATE POLICY "Members can read conference" ON cb_conferences
    FOR SELECT USING (
      id IN (SELECT conference_id FROM cb_conference_members WHERE user_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- cb_conference_documents: members can read + write
DO $$ BEGIN
  CREATE POLICY "Members can read conf documents" ON cb_conference_documents
    FOR SELECT USING (
      conference_id IN (SELECT conference_id FROM cb_conference_members WHERE user_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Members can insert conf documents" ON cb_conference_documents
    FOR INSERT WITH CHECK (
      conference_id IN (SELECT conference_id FROM cb_conference_members WHERE user_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- cb_conference_attendees: members can read + write
DO $$ BEGIN
  CREATE POLICY "Members can read conf attendees" ON cb_conference_attendees
    FOR SELECT USING (
      conference_id IN (SELECT conference_id FROM cb_conference_members WHERE user_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Members can insert conf attendees" ON cb_conference_attendees
    FOR INSERT WITH CHECK (
      conference_id IN (SELECT conference_id FROM cb_conference_members WHERE user_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Members can update conf attendees" ON cb_conference_attendees
    FOR UPDATE USING (
      conference_id IN (SELECT conference_id FROM cb_conference_members WHERE user_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- cb_conference_members: members can read membership list
DO $$ BEGIN
  CREATE POLICY "Members can read membership" ON cb_conference_members
    FOR SELECT USING (
      conference_id IN (SELECT conference_id FROM cb_conference_members cm2 WHERE cm2.user_id = auth.uid())
    );
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
