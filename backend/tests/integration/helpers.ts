import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';
import type { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../../src/lib/db';
import type { AuthRequest } from '../../src/middleware/auth.middleware';

const RESET_SQL = `TRUNCATE notifications, notification_preferences, workspace_messages, note_shares, event_participants, tasks, invitations, notes, events, workspace_members, workspaces, users RESTART IDENTITY CASCADE`;
let schemaBootstrapped = false;

async function ensureIntegrationSchema() {
  if (schemaBootstrapped) return;

  const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  await pool.query(schemaSql);

  // These tables are created in backend startup and are required by integration tests.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(60) NOT NULL,
      title VARCHAR(180) NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      read_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(60) NOT NULL,
      is_muted BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, type)
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id)`);

  schemaBootstrapped = true;
}

export type MockResponse = Response & {
  statusCode: number;
  payload: unknown;
  headers: Record<string, string>;
};

export async function ensureDatabaseReady() {
  await pool.query('SELECT 1');
  await ensureIntegrationSchema();
}

export async function resetDatabase() {
  const dbUrl = process.env.DATABASE_URL || '';
  const dbName = process.env.DB_NAME || '';
  if (!dbUrl.includes('test') && !dbName.includes('test')) {
    throw new Error(
      'Safety check: resetDatabase() refuses to run — DATABASE_URL does not point to a test database. ' +
      'Check that tests/integration/setup.ts loaded before db.ts was imported.'
    );
  }
  await pool.query(RESET_SQL);
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function createMockResponse(): MockResponse {
  const response: Partial<MockResponse> = {
    statusCode: 200,
    payload: undefined,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this as MockResponse;
    },
    json(body: unknown) {
      this.payload = body;
      return this as MockResponse;
    },
    send(body: unknown) {
      this.payload = body;
      return this as MockResponse;
    },
    setHeader(name: string, value: string) {
      this.headers![name] = value;
      return this as MockResponse;
    },
  };

  return response as MockResponse;
}

export function makeAuthRequest(overrides: Partial<AuthRequest> = {}) {
  return {
    userId: undefined,
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as AuthRequest;
}

export async function createUser(params: {
  id?: string;
  name: string;
  email: string;
  password?: string;
  verified?: boolean;
  verificationCodeHash?: string | null;
  verificationCodeExpiresAt?: Date | string | null;
  verificationLastSentAt?: Date | string | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | string | null;
  passwordResetLastSentAt?: Date | string | null;
}) {
  const id = params.id || randomUUID();
  const password = params.password || 'Password123!';
  const passwordHash = await bcrypt.hash(password, 12);
  const emailVerifiedAt = params.verified === false ? null : new Date();

  await pool.query(
    `INSERT INTO users (
       id,
       name,
       email,
       password_hash,
       email_verified_at,
       verification_code_hash,
       verification_code_expires_at,
       verification_code_attempts,
       verification_last_sent_at,
       password_reset_token_hash,
       password_reset_expires_at,
       password_reset_last_sent_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11)`,
    [
      id,
      params.name,
      params.email.toLowerCase(),
      passwordHash,
      emailVerifiedAt,
      params.verificationCodeHash || null,
      params.verificationCodeExpiresAt || null,
      params.verificationLastSentAt || null,
      params.passwordResetTokenHash || null,
      params.passwordResetExpiresAt || null,
      params.passwordResetLastSentAt || null,
    ]
  );

  return { id, name: params.name, email: params.email.toLowerCase(), password, passwordHash };
}

export async function createWorkspace(params: {
  ownerId: string;
  name: string;
  description?: string | null;
}) {
  const workspaceId = randomUUID();

  await pool.query(
    `INSERT INTO workspaces (id, name, description, owner_id)
     VALUES ($1, $2, $3, $4)`,
    [workspaceId, params.name, params.description || null, params.ownerId]
  );

  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [workspaceId, params.ownerId]
  );

  return { id: workspaceId, name: params.name, description: params.description || null, owner_id: params.ownerId };
}

export async function addWorkspaceMember(params: {
  workspaceId: string;
  userId: string;
  role?: 'owner' | 'member';
}) {
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id)
     DO UPDATE SET role = EXCLUDED.role`,
    [params.workspaceId, params.userId, params.role || 'member']
  );
}

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}) {
  const notificationId = randomUUID();

  await pool.query(
    `INSERT INTO notifications (id, user_id, type, title, message, metadata, is_read)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
    [notificationId, params.userId, params.type, params.title, params.message, params.metadata || null]
  );

  return notificationId;
}