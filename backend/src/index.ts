import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.routes';
import eventRoutes from './routes/event.routes';
import taskRoutes from './routes/task.routes';
import noteRoutes from './routes/note.routes';
import workspaceRoutes from './routes/workspace.routes';
import notificationRoutes from './routes/notification.routes';
import { query, pool } from './lib/db';
import { setSocketServer } from './lib/socket';
import { runMigration } from './db/migrate';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

setSocketServer(io);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/notifications', notificationRoutes);

// Socket.io connection
io.use((socket, next) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return next(new Error('JWT secret is not configured.'));
  }

  const token = typeof socket.handshake.auth?.token === 'string'
    ? socket.handshake.auth.token
    : typeof socket.handshake.query?.token === 'string'
      ? socket.handshake.query.token
      : null;

  if (!token) {
    return next(new Error('Socket token is required.'));
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    socket.data.userId = decoded.userId;
    return next();
  } catch {
    return next(new Error('Invalid socket token.'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.userId as string | undefined;
  if (userId) {
    socket.join(`user:${userId}`);
    query<{ workspace_id: string }>(
      `SELECT workspace_id
       FROM workspace_members
       WHERE user_id = $1`,
      [userId]
    )
      .then((result) => {
        result.rows.forEach((row) => {
          socket.join(`workspace:${row.workspace_id}`);
        });
      })
      .catch((err) => {
        console.error('workspace socket join error:', err);
      });
  }

  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;

const bootstrap = async () => {
  try {
    await runMigration(pool);

    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_workspace_messages_workspace_created ON workspace_messages(workspace_id, created_at DESC)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_event_participants_event_user ON event_participants(event_id, user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_note_shares_note_workspace ON note_shares(note_id, workspace_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_note_shares_workspace ON note_shares(workspace_id)`);

    await query(`ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_hash VARCHAR(255)`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMPTZ`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_attempts INTEGER DEFAULT 0`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_last_sent_at TIMESTAMPTZ`);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_event_categories JSONB DEFAULT '[]'::jsonb`);
    await query(`
      UPDATE users
      SET user_event_categories = '[
        {"type":"important","label":"Important","color":"#ef4444"},
        {"type":"work","label":"Work","color":"#f97316"},
        {"type":"personal","label":"Personal","color":"#3b82f6"},
        {"type":"team","label":"Team","color":"#8b5cf6"},
        {"type":"interests","label":"Interests","color":"#22c55e"}
      ]'::jsonb
      WHERE user_event_categories IS NULL
         OR jsonb_typeof(user_event_categories) <> 'array'
         OR jsonb_array_length(user_event_categories) = 0
    `);
    await query(`
      UPDATE users
      SET email_verified_at = COALESCE(email_verified_at, created_at)
      WHERE email_verified_at IS NULL
        AND verification_code_hash IS NULL
    `);

    await query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL`);
    await query(`UPDATE note_shares SET permission = 'viewer' WHERE permission <> 'viewer'`);
    await query(`ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS last_chat_seen_at TIMESTAMPTZ DEFAULT NOW()`);
    await query(`UPDATE workspace_members SET last_chat_seen_at = COALESCE(last_chat_seen_at, joined_at, NOW())`);
    await query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_group VARCHAR(80) DEFAULT 'General'`);
    await query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE`);
    await query(`UPDATE notes SET note_group = 'General' WHERE note_group IS NULL`);
    await query(`ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS decline_reason TEXT`);
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS series_id UUID`);
    await query(`UPDATE events SET series_id = COALESCE(recurrence_parent_id, id) WHERE series_id IS NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_events_series_id ON events(series_id)`);
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_rule VARCHAR(20) DEFAULT 'none'`);
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1`);
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_until TIMESTAMPTZ`);
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES events(id) ON DELETE SET NULL`);
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_index INTEGER DEFAULT 0`);
    await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type VARCHAR(30) DEFAULT 'general'`);
    await query(`UPDATE events SET event_type = 'general' WHERE event_type IS NULL`);
  } catch (err) {
    console.error('startup migration error:', err);
  }

  httpServer.listen(PORT, () => {
    console.log(`Planora backend running on http://localhost:${PORT}`);
  });
};

bootstrap();
