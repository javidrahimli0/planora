import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createEvent, getEvent, getEvents } from '../../src/controllers/event.controller';
import {
  getUnreadCount,
  markNotificationRead,
} from '../../src/controllers/notification.controller';
import {
  createNote,
  shareNoteToWorkspace,
} from '../../src/controllers/note.controller';
import {
  createWorkspace,
  getWorkspaces,
} from '../../src/controllers/workspace.controller';
import {
  exportICS,
  importICS,
} from '../../src/controllers/ics.controller';
import {
  login,
  register,
  requestPasswordReset,
  resetPassword,
  verifyEmailCode,
} from '../../src/controllers/auth.controller';
import { pool } from '../../src/lib/db';
import {
  addWorkspaceMember,
  createMockResponse,
  createNotification,
  createUser,
  createWorkspace as seedWorkspace,
  ensureDatabaseReady,
  makeAuthRequest,
  resetDatabase,
  sha256,
} from './helpers';
import * as email from '../../src/lib/email';

vi.mock('../../src/lib/email', () => ({
  sendVerificationCodeEmail: vi.fn(async () => ({ sent: true })),
  sendPasswordResetEmail: vi.fn(async () => ({ sent: true })),
  sendWorkspaceInviteEmail: vi.fn(async () => ({ sent: true })),
}));

describe('backend integration', () => {
  beforeAll(async () => {
    await ensureDatabaseReady();
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(email.sendVerificationCodeEmail).mockClear();
    vi.mocked(email.sendPasswordResetEmail).mockClear();
    vi.mocked(email.sendWorkspaceInviteEmail).mockClear();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('auth flows', () => {
    it('registers a user and sends a verification code', async () => {
      const req = {
        body: {
          name: 'Mira Hart',
          email: 'Mira@example.com',
          password: 'Password123!',
        },
      };
      const res = createMockResponse();

      await register(req as never, res);

      expect(res.statusCode).toBe(201);
      expect(res.payload).toMatchObject({
        requiresVerification: true,
        email: 'mira@example.com',
        expiresInSeconds: 180,
      });
      expect(email.sendVerificationCodeEmail).toHaveBeenCalledTimes(1);

      const user = await pool.query('SELECT email, email_verified_at, verification_code_hash FROM users WHERE email = $1', ['mira@example.com']);
      expect(user.rows[0].email_verified_at).toBeNull();
      expect(user.rows[0].verification_code_hash).toBeTruthy();
    });

    it('verifies an email code against a stored hash', async () => {
      await createUser({
        name: 'Iris Stone',
        email: 'iris@example.com',
        verified: false,
        verificationCodeHash: sha256('123456'),
        verificationCodeExpiresAt: new Date(Date.now() + 60_000),
        verificationLastSentAt: new Date(),
      });

      const res = createMockResponse();
      await verifyEmailCode({ body: { email: 'iris@example.com', code: '123456' } } as never, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({ message: 'Email verified successfully.' });

      const user = await pool.query('SELECT email_verified_at, verification_code_hash FROM users WHERE email = $1', ['iris@example.com']);
      expect(user.rows[0].email_verified_at).not.toBeNull();
      expect(user.rows[0].verification_code_hash).toBeNull();
    });

    it('logs in a verified user and returns a signed token', async () => {
      const user = await createUser({
        name: 'Noah Reed',
        email: 'noah@example.com',
        password: 'Secret123!',
      });

      const res = createMockResponse();
      await login({ body: { email: 'noah@example.com', password: 'Secret123!' } } as never, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({
        user: {
          id: user.id,
          email: 'noah@example.com',
          name: 'Noah Reed',
        },
      });

      const token = (res.payload as { token: string }).token;
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: string };
      expect(decoded.userId).toBe(user.id);
    });

    it('creates a reset token and stores its hash', async () => {
      await createUser({
        name: 'Ava Moss',
        email: 'ava@example.com',
      });

      const res = createMockResponse();
      await requestPasswordReset({ body: { email: 'ava@example.com' } } as never, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({ retryInSeconds: 30 });
      expect(email.sendPasswordResetEmail).toHaveBeenCalledTimes(1);

      const [emailArg] = vi.mocked(email.sendPasswordResetEmail).mock.calls[0];
      expect(emailArg.to).toBe('ava@example.com');
      expect(emailArg.resetLink).toContain('/reset-password?token=');

      const user = await pool.query(
        'SELECT password_reset_token_hash, password_reset_expires_at, password_reset_last_sent_at FROM users WHERE email = $1',
        ['ava@example.com']
      );
      expect(user.rows[0].password_reset_token_hash).toBeTruthy();
      expect(user.rows[0].password_reset_expires_at).not.toBeNull();
      expect(user.rows[0].password_reset_last_sent_at).not.toBeNull();
    });

    it('resets a password and clears the reset challenge', async () => {
      const token = 'reset-token-123';
      const oldPassword = 'OldPassword123!';
      const user = await createUser({
        name: 'Mason Vale',
        email: 'mason@example.com',
        password: oldPassword,
        passwordResetTokenHash: sha256(token),
        passwordResetExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        passwordResetLastSentAt: new Date(),
      });

      const res = createMockResponse();
      await resetPassword({ body: { token, password: 'NewPassword123!' } } as never, res);

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({ message: 'Password updated successfully.' });

      const updated = await pool.query('SELECT password_hash, password_reset_token_hash, password_reset_expires_at FROM users WHERE id = $1', [user.id]);
      expect(updated.rows[0].password_reset_token_hash).toBeNull();
      expect(updated.rows[0].password_reset_expires_at).toBeNull();
      expect(await bcrypt.compare('NewPassword123!', updated.rows[0].password_hash)).toBe(true);
      expect(await bcrypt.compare(oldPassword, updated.rows[0].password_hash)).toBe(false);
    });
  });

  describe('workspace and note flows', () => {
    it('creates a workspace and lists it for the owner', async () => {
      const user = await createUser({
        name: 'Olive Gray',
        email: 'olive@example.com',
      });

      const createRes = createMockResponse();
      await createWorkspace(makeAuthRequest({ userId: user.id, body: { name: 'Launch Team', description: 'Product rollout' } }), createRes);

      expect(createRes.statusCode).toBe(201);
      expect(createRes.payload).toMatchObject({
        workspace: {
          name: 'Launch Team',
          description: 'Product rollout',
          owner_id: user.id,
          role: 'owner',
          member_count: 1,
        },
      });

      const listRes = createMockResponse();
      await getWorkspaces(makeAuthRequest({ userId: user.id, query: { page: '1', limit: '10' } }), listRes);

      expect(listRes.statusCode).toBe(200);
      expect(listRes.payload).toMatchObject({
        workspaces: [
          expect.objectContaining({
            name: 'Launch Team',
            role: 'owner',
            member_count: 1,
          }),
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      });
    });

    it('creates a personal note with the stored group and content', async () => {
      const user = await createUser({
        name: 'Theo Lane',
        email: 'theo@example.com',
      });

      const res = createMockResponse();
      await createNote(
        makeAuthRequest({
          userId: user.id,
          body: {
            title: 'Morning plan',
            content: 'Ship the release notes.',
            note_group: 'Planning',
            is_pinned: true,
          },
        }),
        res
      );

      expect(res.statusCode).toBe(201);
      expect(res.payload).toMatchObject({
        note: {
          title: 'Morning plan',
          content: 'Ship the release notes.',
          note_group: 'Planning',
          is_pinned: true,
          access_permission: 'owner',
          access_scope: 'mine',
          shares_count: 0,
        },
      });

      const noteRow = await pool.query('SELECT title, content, note_group, is_pinned FROM notes WHERE user_id = $1', [user.id]);
      expect(noteRow.rows[0]).toMatchObject({
        title: 'Morning plan',
        content: 'Ship the release notes.',
        note_group: 'Planning',
        is_pinned: true,
      });
    });

    it('shares a note to a workspace and creates the message trail', async () => {
      const owner = await createUser({
        name: 'Nora Finch',
        email: 'nora@example.com',
      });
      const teammate = await createUser({
        name: 'Eli Finch',
        email: 'eli@example.com',
      });
      const workspace = await seedWorkspace({ ownerId: owner.id, name: 'Design Crew' });
      await addWorkspaceMember({ workspaceId: workspace.id, userId: teammate.id, role: 'member' });

      const noteRes = createMockResponse();
      await createNote(
        makeAuthRequest({
          userId: owner.id,
          body: { title: 'Shared note', content: 'Keep this visible to the team.' },
        }),
        noteRes
      );
      const noteId = (noteRes.payload as { note: { id: string } }).note.id;

      const shareRes = createMockResponse();
      await shareNoteToWorkspace(
        makeAuthRequest({
          userId: owner.id,
          params: { id: noteId },
          body: { workspace_id: workspace.id },
        }),
        shareRes
      );

      expect(shareRes.statusCode).toBe(200);
      expect(shareRes.payload).toMatchObject({
        share: {
          note_id: noteId,
          workspace_id: workspace.id,
          permission: 'viewer',
          shared_by: owner.id,
        },
      });

      const shareRow = await pool.query('SELECT note_id, workspace_id, permission, shared_by FROM note_shares WHERE note_id = $1', [noteId]);
      expect(shareRow.rows[0]).toMatchObject({
        note_id: noteId,
        workspace_id: workspace.id,
        permission: 'viewer',
        shared_by: owner.id,
      });

      const messageRow = await pool.query('SELECT workspace_id, user_id, content FROM workspace_messages WHERE workspace_id = $1', [workspace.id]);
      expect(messageRow.rows[0].workspace_id).toBe(workspace.id);
      expect(messageRow.rows[0].user_id).toBe(owner.id);
      expect(messageRow.rows[0].content).toContain('shared a note in Design Crew');
    });
  });

  describe('event, notification, and calendar flows', () => {
    it('creates a personal event and retrieves it again', async () => {
      const user = await createUser({
        name: 'Zoe Hart',
        email: 'zoe@example.com',
      });

      const start = '2026-04-01T09:00:00.000Z';
      const end = '2026-04-01T10:00:00.000Z';
      const createRes = createMockResponse();
      await createEvent(
        makeAuthRequest({
          userId: user.id,
          body: {
            title: 'Planning session',
            description: 'Align on launch scope',
            start_time: start,
            end_time: end,
            color: '#f97316',
          },
        }),
        createRes
      );

      expect(createRes.statusCode).toBe(201);
      expect(createRes.payload).toMatchObject({
        created_count: 1,
        event: expect.objectContaining({
          title: 'Planning session',
          description: 'Align on launch scope',
          start_time: new Date(start),
          end_time: new Date(end),
        }),
      });

      const createdEventId = (createRes.payload as { event: { id: string } }).event.id;
      const readRes = createMockResponse();
      await getEvent(makeAuthRequest({ userId: user.id, params: { id: createdEventId } }), readRes);

      expect(readRes.statusCode).toBe(200);
      expect(readRes.payload).toMatchObject({
        event: {
          id: createdEventId,
          title: 'Planning session',
          description: 'Align on launch scope',
        },
      });
    });

    it('filters events by the requested date window', async () => {
      const user = await createUser({
        name: 'Lena Cross',
        email: 'lena@example.com',
      });

      await createEvent(
        makeAuthRequest({
          userId: user.id,
          body: {
            title: 'Inside range',
            start_time: '2026-05-01T09:00:00.000Z',
            end_time: '2026-05-01T10:00:00.000Z',
          },
        }),
        createMockResponse()
      );

      await createEvent(
        makeAuthRequest({
          userId: user.id,
          body: {
            title: 'Outside range',
            start_time: '2026-05-10T09:00:00.000Z',
            end_time: '2026-05-10T10:00:00.000Z',
          },
        }),
        createMockResponse()
      );

      const res = createMockResponse();
      await getEvents(
        makeAuthRequest({
          userId: user.id,
          query: {
            from: '2026-05-01T00:00:00.000Z',
            to: '2026-05-02T00:00:00.000Z',
            page: '1',
            limit: '10',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.payload).toMatchObject({
        events: [
          expect.objectContaining({ title: 'Inside range' }),
        ],
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          total_pages: 1,
          has_next: false,
          has_prev: false,
        },
      });
    });

    it('marks a notification as read and updates the unread count', async () => {
      const user = await createUser({
        name: 'Kai Bloom',
        email: 'kai@example.com',
      });
      const notificationId = await createNotification({
        userId: user.id,
        type: 'workspace_member_joined',
        title: 'New teammate',
        message: 'A teammate joined the workspace.',
      });

      const unreadBefore = createMockResponse();
      await getUnreadCount(makeAuthRequest({ userId: user.id }), unreadBefore);
      expect(unreadBefore.statusCode).toBe(200);
      expect(unreadBefore.payload).toMatchObject({ unread_count: 1 });

      const markRes = createMockResponse();
      await markNotificationRead(makeAuthRequest({ userId: user.id, params: { id: notificationId } }), markRes);

      expect(markRes.statusCode).toBe(200);
      expect(markRes.payload).toMatchObject({
        notification: {
          id: notificationId,
          is_read: true,
        },
      });

      const unreadAfter = createMockResponse();
      await getUnreadCount(makeAuthRequest({ userId: user.id }), unreadAfter);
      expect(unreadAfter.payload).toMatchObject({ unread_count: 0 });

      const notificationRow = await pool.query('SELECT is_read, read_at FROM notifications WHERE id = $1', [notificationId]);
      expect(notificationRow.rows[0].is_read).toBe(true);
      expect(notificationRow.rows[0].read_at).not.toBeNull();
    });

    it('imports an ICS event and exports it back out', async () => {
      const user = await createUser({
        name: 'Rhea Vale',
        email: 'rhea@example.com',
      });

      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Planora Integration Test//EN',
        'BEGIN:VEVENT',
        'UID:integration-event-1@example.com',
        'DTSTART:20260401T090000Z',
        'DTEND:20260401T100000Z',
        'SUMMARY:Imported from calendar',
        'DESCRIPTION:Imported via integration test',
        'LOCATION:Remote',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const importRes = createMockResponse();
      const importReq = makeAuthRequest({ userId: user.id });
      (importReq as unknown as Record<string, unknown>).file = { buffer: Buffer.from(icsContent, 'utf-8') };
      await importICS(importReq, importRes);

      expect(importRes.statusCode).toBe(200);
      expect(importRes.payload).toMatchObject({
        imported: 1,
        skipped: 0,
      });

      const imported = await pool.query('SELECT title, ics_uid, source FROM events WHERE user_id = $1', [user.id]);
      expect(imported.rows[0]).toMatchObject({
        title: 'Imported from calendar',
        ics_uid: 'integration-event-1@example.com',
        source: 'imported',
      });

      const exportRes = createMockResponse();
      await exportICS(makeAuthRequest({ userId: user.id }), exportRes);

      expect(exportRes.statusCode).toBe(200);
      expect(exportRes.headers['Content-Type']).toBe('text/calendar; charset=utf-8');
      expect(exportRes.headers['Content-Disposition']).toContain('planora-events-');
      expect(String(exportRes.payload)).toContain('BEGIN:VCALENDAR');
      expect(String(exportRes.payload)).toContain('SUMMARY:Imported from calendar');
      expect(String(exportRes.payload)).toContain('UID:integration-event-1@example.com');
    });
  });
});