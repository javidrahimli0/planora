-- Planora Database Schema
-- Run this file via: npm run db:migrate

-- ───────────────────────────────────────────
-- USERS
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100)        NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),                        -- NULL if using OAuth in future
  email_verified_at TIMESTAMPTZ,
  verification_code_hash VARCHAR(255),
  verification_code_expires_at TIMESTAMPTZ,
  verification_code_attempts INTEGER DEFAULT 0,
  verification_last_sent_at TIMESTAMPTZ,
  password_reset_token_hash VARCHAR(255),
  password_reset_expires_at TIMESTAMPTZ,
  password_reset_last_sent_at TIMESTAMPTZ,
  avatar_url    TEXT,
  theme         VARCHAR(10)  DEFAULT 'light',        -- 'light' | 'dark'
  user_event_categories JSONB DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ───────────────────────────────────────────
-- WORKSPACES
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(150)  NOT NULL,
  description TEXT,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  role         VARCHAR(20) DEFAULT 'member',           -- 'owner' | 'member'
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  last_chat_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- ───────────────────────────────────────────
-- EVENTS
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
  workspace_id UUID          REFERENCES workspaces(id)      ON DELETE SET NULL,
  title        VARCHAR(255)  NOT NULL,
  description  TEXT,
  start_time   TIMESTAMPTZ   NOT NULL,
  end_time     TIMESTAMPTZ   NOT NULL,
  event_type   VARCHAR(30)   DEFAULT 'general',            -- 'important' | 'work' | 'personal' | 'hobby' | 'health' | 'general'
  color        VARCHAR(20)   DEFAULT '#6366f1',             -- hex color for UI
  is_all_day   BOOLEAN       DEFAULT FALSE,
  is_imported  BOOLEAN       DEFAULT FALSE,                 -- TRUE if from .ics file
  ics_uid      VARCHAR(500),                                -- unique ID from .ics file
  source       VARCHAR(50)   DEFAULT 'planora',             -- 'planora' | 'google' | 'outlook' | 'apple'
  location     VARCHAR(300),
  series_id    UUID,
  recurrence_rule VARCHAR(20) DEFAULT 'none',               -- 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  recurrence_interval INTEGER DEFAULT 1,
  recurrence_until TIMESTAMPTZ,
  recurrence_parent_id UUID REFERENCES events(id) ON DELETE SET NULL,
  recurrence_index INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- Participants of workspace/shared events (for meeting invites)
CREATE TABLE IF NOT EXISTS event_participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status     VARCHAR(20) DEFAULT 'pending',               -- 'pending' | 'accepted' | 'declined'
  decline_reason TEXT,
  responded_at TIMESTAMPTZ,
  UNIQUE(event_id, user_id)
);

-- ───────────────────────────────────────────
-- TASKS
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  workspace_id UUID          REFERENCES workspaces(id) ON DELETE SET NULL,
  event_id     UUID          REFERENCES events(id)     ON DELETE SET NULL,
  title        VARCHAR(255)  NOT NULL,
  description  TEXT,
  due_date     TIMESTAMPTZ,
  priority     VARCHAR(20)   DEFAULT 'medium',            -- 'low' | 'medium' | 'high'
  status       VARCHAR(20)   DEFAULT 'pending',           -- 'pending' | 'in_progress' | 'done'
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW()
);

-- ───────────────────────────────────────────
-- NOTES
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  -- Event note: tied to an event, deleted with event, visible to all participants
  event_id   UUID          REFERENCES events(id) ON DELETE CASCADE,
  -- Daily/weekly note: standalone, not tied to any event
  note_type  VARCHAR(20)   DEFAULT 'daily',               -- 'event' | 'daily' | 'weekly'
  note_date  DATE,                                        -- for daily/weekly notes
  note_group VARCHAR(80)   DEFAULT 'General',
  is_pinned  BOOLEAN       DEFAULT FALSE,
  title      VARCHAR(255),
  content    TEXT          NOT NULL,
  created_at TIMESTAMPTZ   DEFAULT NOW(),
  updated_at TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS note_shares (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id      UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  permission   VARCHAR(20) NOT NULL DEFAULT 'viewer',      -- view-only sharing
  shared_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(note_id, workspace_id)
);

-- ───────────────────────────────────────────
-- WORKSPACE INVITATIONS
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inviter_id   UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  invitee_email VARCHAR(255) NOT NULL,
  status       VARCHAR(20)   DEFAULT 'pending',           -- 'pending' | 'accepted' | 'declined'
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(workspace_id, invitee_email)
);

-- ───────────────────────────────────────────
-- WORKSPACE MESSAGES
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ───────────────────────────────────────────
-- INDEXES (for performance)
-- ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_user_id      ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_workspace_id ON events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_events_start_time   ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_series_id    ON events(series_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id       ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_event_id      ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id       ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_event_id      ON notes(event_id);
CREATE INDEX IF NOT EXISTS idx_notes_note_date     ON notes(note_date);
CREATE INDEX IF NOT EXISTS idx_note_shares_note_workspace ON note_shares(note_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_note_shares_workspace ON note_shares(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members   ON workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_event_participants  ON event_participants(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_messages_workspace_created ON workspace_messages(workspace_id, created_at DESC);
