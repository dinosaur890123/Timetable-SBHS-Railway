-- SBHS Timetable Admin Persistence
-- This schema stores admin-facing users, system state, and logs.

CREATE TABLE IF NOT EXISTS system_state (
  id INTEGER PRIMARY KEY,
  maintenance BOOLEAN NOT NULL DEFAULT FALSE,
  broadcast_message TEXT NULL,
  broadcast_type TEXT NULL,
  ai_provider TEXT NOT NULL DEFAULT 'hackclub',
  ai_model TEXT NOT NULL DEFAULT 'qwen/qwen3-32b',
  ai_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  version TEXT NOT NULL DEFAULT '1.0.0',
  hidden_pages JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_state (id, maintenance)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NULL,
  year TEXT NULL,
  role TEXT NOT NULL DEFAULT 'Student',
  status TEXT NOT NULL DEFAULT 'Active',
  joined TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_users_last_seen_idx ON app_users (last_seen DESC);

CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  details TEXT NULL
);

CREATE INDEX IF NOT EXISTS logs_created_at_idx ON logs (created_at DESC);

CREATE TABLE IF NOT EXISTS ai_cache (
  date_key TEXT PRIMARY KEY, -- 'YYYY-MM-DD' (Sydney time)
  notice_priorities JSONB NOT NULL, -- AI-generated [{index, priority}] only; no notice content
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrations
ALTER TABLE system_state ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'qwen/qwen3-32b';
ALTER TABLE system_state ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'hackclub';
ALTER TABLE system_state ADD COLUMN IF NOT EXISTS ai_disabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE system_state ADD COLUMN IF NOT EXISTS hidden_pages JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  student_id TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  provider TEXT NOT NULL,
  model TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_usage_logs_created_at_idx ON ai_usage_logs (created_at DESC);

-- Stripe subscription billing migrations
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS subscription_status TEXT NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS show_supporter BOOLEAN NOT NULL DEFAULT TRUE;

-- Study Notes migrations
CREATE TABLE IF NOT EXISTS app_notes (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_notes_student_id_idx ON app_notes (student_id);

CREATE TABLE IF NOT EXISTS app_feedback (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_feedback_student_id_idx ON app_feedback (student_id);
CREATE INDEX IF NOT EXISTS app_feedback_created_at_idx ON app_feedback (created_at DESC);

-- Feedback migrations
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE app_feedback ADD COLUMN IF NOT EXISTS resolved_notified BOOLEAN NOT NULL DEFAULT FALSE;

-- Homework/Assignments migrations
CREATE TABLE IF NOT EXISTS app_assignments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  priority TEXT NOT NULL DEFAULT 'Medium',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_assignments_student_id_idx ON app_assignments (student_id);

-- Version management migration
ALTER TABLE system_state ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '1.0.0';

-- User preferences migration
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS user_preferences JSONB NULL;

-- Blacklist migration
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS blacklisted BOOLEAN NOT NULL DEFAULT FALSE;

-- Canvas Links migration: each student's own links, one per class per school year.
CREATE TABLE IF NOT EXISTS canvas_links (
  id TEXT PRIMARY KEY,
  class_name TEXT NOT NULL,
  canvas_url TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  school_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Links saved before school years were tracked belong to the year they were made in.
ALTER TABLE canvas_links ADD COLUMN IF NOT EXISTS school_year INTEGER;
UPDATE canvas_links SET school_year = EXTRACT(YEAR FROM (created_at AT TIME ZONE 'Australia/Sydney'))::int WHERE school_year IS NULL;
ALTER TABLE canvas_links ALTER COLUMN school_year SET NOT NULL;
ALTER TABLE canvas_links DROP CONSTRAINT IF EXISTS canvas_links_class_name_student_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS canvas_links_student_year_class_key ON canvas_links (student_id, school_year, class_name);
CREATE INDEX IF NOT EXISTS canvas_links_class_name_idx ON canvas_links (class_name);
CREATE INDEX IF NOT EXISTS canvas_links_student_id_idx ON canvas_links (student_id);

-- Shared Canvas links: one row per Canvas course suggested for a class in a school year.
-- class_key is the timetable's year + short title, e.g. "9Ma1".
CREATE TABLE IF NOT EXISTS canvas_class_links (
  id TEXT PRIMARY KEY,
  class_key TEXT NOT NULL,
  school_year INTEGER NOT NULL,
  class_name TEXT NOT NULL,
  course_id TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  locked_status TEXT NULL CHECK (locked_status IN ('verified', 'rejected')), -- set by an admin; overrides votes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_year, class_key, course_id)
);

CREATE INDEX IF NOT EXISTS canvas_class_links_submitted_by_idx ON canvas_class_links (submitted_by, created_at);

-- One vote per student per shared link: 1 backs it, -1 reports it as wrong.
CREATE TABLE IF NOT EXISTS canvas_class_link_votes (
  link_id TEXT NOT NULL REFERENCES canvas_class_links(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  vote SMALLINT NOT NULL CHECK (vote IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (link_id, student_id)
);

CREATE INDEX IF NOT EXISTS canvas_class_link_votes_student_idx ON canvas_class_link_votes (student_id);

-- canvas_courses, canvas_course_reports and canvas_link_suggestions were used by
-- earlier versions of Canvas links and are no longer read. They are left in place
-- so no data is dropped automatically; they can be dropped by hand.

-- Shared Resources migration
CREATE TABLE IF NOT EXISTS shared_resources (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL, -- 'note', 'assignment', 'link', 'file'
  resource_id TEXT NOT NULL, -- Reference to app_notes.id, app_assignments.id, etc.
  title TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shared_resources_sender_id_idx ON shared_resources (sender_id);
CREATE INDEX IF NOT EXISTS shared_resources_recipient_id_idx ON shared_resources (recipient_id);
CREATE INDEX IF NOT EXISTS shared_resources_status_idx ON shared_resources (status);

-- Notifications migration
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'resource_share', 'system', 'feedback', 'assignment'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON notifications (read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);

-- Build Notes migration
CREATE TABLE IF NOT EXISTS app_build_notes (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_build_notes_created_at_idx ON app_build_notes (created_at DESC);

-- Privacy: purge stored AI-derived/API content, then reshape the AI tables.
-- Runs last so both tables exist on fresh databases; idempotent on re-runs.
DELETE FROM ai_usage_logs;
DELETE FROM ai_cache;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS answer;
ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE ai_cache DROP COLUMN IF EXISTS briefing;
ALTER TABLE ai_cache DROP COLUMN IF EXISTS prioritized_notices;
ALTER TABLE ai_cache ADD COLUMN IF NOT EXISTS notice_priorities JSONB;
