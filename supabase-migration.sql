-- ConfBuddy v2 Migration — Conference-centric architecture
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── Conferences ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cb_conferences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  location     text,
  start_date   date,
  end_date     date,
  description  text,
  is_active    boolean DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ── Conference members (team sharing) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cb_conference_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id  uuid NOT NULL REFERENCES cb_conferences(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role           text DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at      timestamptz DEFAULT now(),
  UNIQUE(conference_id, user_id)
);

-- ── Conference documents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cb_conference_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id  uuid NOT NULL REFERENCES cb_conferences(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename       text NOT NULL,
  file_type      text DEFAULT 'other'
                   CHECK (file_type IN ('attendee_list','crm_export','battlecard','product_sheet','competitor_intel','other')),
  storage_path   text,
  extracted_text text,
  row_count      integer,
  processed_at   timestamptz,
  created_at     timestamptz DEFAULT now()
);

-- ── Conference attendees (pre-loaded from attendee list) ──────────────────────
CREATE TABLE IF NOT EXISTS cb_conference_attendees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id  uuid NOT NULL REFERENCES cb_conferences(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name      text,
  company        text,
  title          text,
  email          text,
  phone          text,
  crm_match_id   text,
  sf_match_id    text,
  contact_id     uuid REFERENCES cb_contacts(id),
  is_target      boolean DEFAULT false,
  intel_cached   boolean DEFAULT false,
  source         text DEFAULT 'attendee_list',
  created_at     timestamptz DEFAULT now()
);

-- ── Extend existing tables ─────────────────────────────────────────────────────
ALTER TABLE cb_contacts ADD COLUMN IF NOT EXISTS conference_id uuid REFERENCES cb_conferences(id);

ALTER TABLE cb_meetings  ADD COLUMN IF NOT EXISTS conference_id uuid REFERENCES cb_conferences(id);
ALTER TABLE cb_meetings  ADD COLUMN IF NOT EXISTS outcome text
  CHECK (outcome IN ('hot','follow_up','not_interested','intro_needed','closed'));

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE cb_conferences           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cb_conference_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cb_conference_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cb_conference_attendees  ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "own_conferences"           ON cb_conferences;
DROP POLICY IF EXISTS "own_conference_members"    ON cb_conference_members;
DROP POLICY IF EXISTS "own_conference_documents"  ON cb_conference_documents;
DROP POLICY IF EXISTS "own_conference_attendees"  ON cb_conference_attendees;

CREATE POLICY "own_conferences"          ON cb_conferences          FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_conference_members"   ON cb_conference_members   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_conference_documents" ON cb_conference_documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_conference_attendees" ON cb_conference_attendees FOR ALL USING (auth.uid() = user_id);

-- ── Storage bucket for documents ──────────────────────────────────────────────
-- Run separately if bucket doesn't exist:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('confbuddy-documents', 'confbuddy-documents', false);
-- CREATE POLICY "auth_users_documents" ON storage.objects FOR ALL USING (auth.role() = 'authenticated');
