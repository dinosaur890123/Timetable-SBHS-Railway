-- SBHS Timetable Admin Persistence
-- This schema stores admin-facing users, system state, and logs.

CREATE TABLE IF NOT EXISTS system_state (
  id INTEGER PRIMARY KEY,
  maintenance BOOLEAN NOT NULL DEFAULT FALSE,
  broadcast_message TEXT NULL,
  broadcast_type TEXT NULL,
  ai_provider TEXT NOT NULL DEFAULT 'hackclub',
  ai_model TEXT NOT NULL DEFAULT 'qwen/qwen3-32b',
  version TEXT NOT NULL DEFAULT '1.0.0',
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
  briefing TEXT NOT NULL,
  prioritized_notices JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrations
ALTER TABLE system_state ADD COLUMN IF NOT EXISTS ai_model TEXT NOT NULL DEFAULT 'qwen/qwen3-32b';
ALTER TABLE system_state ADD COLUMN IF NOT EXISTS ai_provider TEXT NOT NULL DEFAULT 'hackclub';

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  student_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
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
