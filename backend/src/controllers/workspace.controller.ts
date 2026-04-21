import { Response } from 'express';
import { query } from '../lib/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendWorkspaceInviteEmail } from '../lib/email';
import { getSocketServer } from '../lib/socket';

interface WorkspaceRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  role: 'owner' | 'member';
  member_count: number;
  has_unseen_messages: boolean;
  last_message_at: string | null;
}

interface WorkspaceMemberRow {
  id: string;
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  name: string;
  email: string;
}

interface WorkspaceMessageRow {
  id: string;
  workspace_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_email: string;
  author_avatar_url: string | null;
}

interface WorkspaceUpcomingEventRow {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  color: string;
  is_all_day: boolean;
  location: string | null;
  creator_name: string;
  creator_email: string;
  participant_status: 'pending' | 'accepted' | 'declined';
  not_joining_count: number;
  joining_count: number;
  pending_count: number;
}

interface WorkspaceSharedNoteRow {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  note_group: string;
  is_pinned: boolean;
  updated_at: string;
  permission: 'viewer';
  owner_name: string;
  owner_email: string;
}

interface InvitationRow {
  id: string;
  workspace_id: string;
  inviter_id: string;
  invitee_email: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
}

interface MyInvitationRow extends InvitationRow {
  workspace_name: string;
  inviter_name: string;
}

interface UserEmailRow {
  email: string;
  name: string;
}

interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

function parsePaginationParams(
  rawPage: unknown,
  rawLimit: unknown,
  defaults: { page?: number; limit?: number; maxLimit?: number } = {}
): PaginationParams {
  const defaultPage = defaults.page ?? 1;
  const defaultLimit = defaults.limit ?? 20;
  const maxLimit = defaults.maxLimit ?? 100;

  const parsedPage = Number(rawPage);
  const parsedLimit = Number(rawLimit);

  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.trunc(parsedPage)) : defaultPage;
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(maxLimit, Math.trunc(parsedLimit)))
    : defaultLimit;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

async function ensureWorkspaceAccess(workspaceId: string, userId: string) {
  const access = await query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM workspace_members
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );
  return access.rows.length > 0;
}

async function ensureWorkspaceOwner(workspaceId: string, userId: string) {
  const access = await query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2
       AND role = 'owner'`,
    [workspaceId, userId]
  );
  return access.rows.length > 0;
}

async function getUserEmailAndName(userId: string) {
  const user = await query<UserEmailRow>(
    `SELECT email, name
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return user.rows[0] || null;
}

async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
}) {
  const globalPref = await query<{ is_muted: boolean }>(
    `SELECT is_muted
     FROM notification_preferences
     WHERE user_id = $1
       AND type = 'global_all'`,
    [params.userId]
  );

  if (globalPref.rows[0]?.is_muted) {
    return;
  }

  const created = await query<{ id: string; created_at: string }>(
    `INSERT INTO notifications (user_id, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [params.userId, params.type, params.title, params.message, params.metadata || null]
  );

  const socketServer = getSocketServer();
  if (socketServer) {
    socketServer.to(`user:${params.userId}`).emit('notification:new', {
      id: created.rows[0].id,
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      metadata: params.metadata || null,
      is_read: false,
      created_at: created.rows[0].created_at,
      read_at: null,
    });
  }
}

export const getWorkspaces = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 12, maxLimit: 50 });

    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM workspaces w
       INNER JOIN workspace_members wm
         ON wm.workspace_id = w.id
        AND wm.user_id = $1`,
      [req.userId]
    );

    const result = await query<WorkspaceRow>(
      `SELECT w.id,
              w.name,
              w.description,
              w.owner_id,
              w.created_at,
              w.updated_at,
              wm.role,
              (
                SELECT COUNT(*)::int
                FROM workspace_members wm2
                WHERE wm2.workspace_id = w.id
              ) AS member_count,
              EXISTS (
                SELECT 1
                FROM workspace_messages unread
                WHERE unread.workspace_id = w.id
                  AND unread.user_id <> $1
                  AND unread.created_at > COALESCE(wm.last_chat_seen_at, wm.joined_at)
              ) AS has_unseen_messages,
              latest_msg.last_message_at
       FROM workspaces w
       INNER JOIN workspace_members wm
         ON wm.workspace_id = w.id
        AND wm.user_id = $1
       LEFT JOIN LATERAL (
         SELECT msg.created_at AS last_message_at
         FROM workspace_messages msg
         WHERE msg.workspace_id = w.id
         ORDER BY msg.created_at DESC
         LIMIT 1
       ) AS latest_msg ON TRUE
       ORDER BY COALESCE(latest_msg.last_message_at, w.updated_at, w.created_at) DESC
       LIMIT $2
       OFFSET $3`,
      [req.userId, pagination.limit, pagination.offset]
    );

    const total = totalResult.rows[0]?.total || 0;
    return res.status(200).json({
      workspaces: result.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / pagination.limit)),
        has_next: pagination.offset + result.rows.length < total,
        has_prev: pagination.page > 1,
      },
    });
  } catch (err) {
    console.error('getWorkspaces error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getWorkspaceChatUnreadSummary = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const result = await query<{ unseen_workspace_count: number }>(
      `SELECT COUNT(*)::int AS unseen_workspace_count
       FROM workspace_members wm
       WHERE wm.user_id = $1
         AND EXISTS (
           SELECT 1
           FROM workspace_messages msg
           WHERE msg.workspace_id = wm.workspace_id
             AND msg.user_id <> $1
             AND msg.created_at > COALESCE(wm.last_chat_seen_at, wm.joined_at)
         )`,
      [req.userId]
    );

    const unseenWorkspaceCount = result.rows[0]?.unseen_workspace_count || 0;
    return res.status(200).json({
      has_unseen_messages: unseenWorkspaceCount > 0,
      unseen_workspace_count: unseenWorkspaceCount,
    });
  } catch (err) {
    console.error('getWorkspaceChatUnreadSummary error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const markWorkspaceChatsSeen = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    await query(
      `UPDATE workspace_members
       SET last_chat_seen_at = NOW()
       WHERE user_id = $1`,
      [req.userId]
    );

    return res.status(200).json({ message: 'Workspace chats marked as seen.' });
  } catch (err) {
    console.error('markWorkspaceChatsSeen error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const createWorkspace = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

  if (!name) {
    return res.status(400).json({ message: 'Workspace name is required.' });
  }

  try {
    const created = await query<WorkspaceRow>(
      `INSERT INTO workspaces (name, description, owner_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, owner_id, created_at, updated_at, 'owner'::text AS role, 1::int AS member_count`,
      [name, description || null, req.userId]
    );

    await query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [created.rows[0].id, req.userId]
    );

    return res.status(201).json({ workspace: created.rows[0] });
  } catch (err) {
    console.error('createWorkspace error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getWorkspaceMembers = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });
  const { id } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 10, maxLimit: 50 });

    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM workspace_members
       WHERE workspace_id = $1`,
      [id]
    );

    const result = await query<WorkspaceMemberRow>(
      `SELECT wm.id,
              wm.workspace_id,
              wm.user_id,
              wm.role,
              wm.joined_at,
              u.name,
              u.email
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
       ORDER BY CASE WHEN wm.role = 'owner' THEN 0 ELSE 1 END, wm.joined_at ASC
       LIMIT $2
       OFFSET $3`,
      [id, pagination.limit, pagination.offset]
    );

    const total = totalResult.rows[0]?.total || 0;
    return res.status(200).json({
      members: result.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / pagination.limit)),
        has_next: pagination.offset + result.rows.length < total,
        has_prev: pagination.page > 1,
      },
    });
  } catch (err) {
    console.error('getWorkspaceMembers error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getInvitations = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });
  const { id } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 10, maxLimit: 50 });

    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM invitations
       WHERE workspace_id = $1
         AND status = 'pending'`,
      [id]
    );

    const result = await query<InvitationRow>(
      `SELECT id, workspace_id, inviter_id, invitee_email, status, created_at, updated_at
       FROM invitations
       WHERE workspace_id = $1
         AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT $2
       OFFSET $3`,
      [id, pagination.limit, pagination.offset]
    );

    const total = totalResult.rows[0]?.total || 0;
    return res.status(200).json({
      invitations: result.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / pagination.limit)),
        has_next: pagination.offset + result.rows.length < total,
        has_prev: pagination.page > 1,
      },
    });
  } catch (err) {
    console.error('getInvitations error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getMyInvitations = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const me = await getUserEmailAndName(req.userId);
    if (!me) return res.status(404).json({ message: 'User not found.' });

    const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 10, maxLimit: 50 });

    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM invitations i
       WHERE LOWER(i.invitee_email) = LOWER($1)
         AND i.status = 'pending'`,
      [me.email]
    );

    const result = await query<MyInvitationRow>(
      `SELECT i.id,
              i.workspace_id,
              i.inviter_id,
              i.invitee_email,
              i.status,
              i.created_at,
              i.updated_at,
              w.name AS workspace_name,
              u.name AS inviter_name
       FROM invitations i
       INNER JOIN workspaces w ON w.id = i.workspace_id
       INNER JOIN users u ON u.id = i.inviter_id
       WHERE LOWER(i.invitee_email) = LOWER($1)
         AND i.status = 'pending'
       ORDER BY i.created_at DESC
       LIMIT $2
       OFFSET $3`,
      [me.email, pagination.limit, pagination.offset]
    );

    const total = totalResult.rows[0]?.total || 0;
    return res.status(200).json({
      invitations: result.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / pagination.limit)),
        has_next: pagination.offset + result.rows.length < total,
        has_prev: pagination.page > 1,
      },
    });
  } catch (err) {
    console.error('getMyInvitations error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const createInvitation = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });
  const { id } = req.params;
  const inviteeEmail = typeof req.body?.invitee_email === 'string' ? req.body.invitee_email.trim().toLowerCase() : '';

  if (!inviteeEmail) {
    return res.status(400).json({ message: 'Invitee email is required.' });
  }

  try {
    const me = await getUserEmailAndName(req.userId);
    if (!me) return res.status(404).json({ message: 'User not found.' });

    if (me.email.toLowerCase() === inviteeEmail) {
      return res.status(400).json({ message: 'You cannot invite your own email.' });
    }

    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const isOwner = await ensureWorkspaceOwner(id, req.userId);
    if (!isOwner) {
      return res.status(403).json({ message: 'Only workspace owners can invite members.' });
    }

    const workspaceRes = await query<{ name: string }>(
      `SELECT name FROM workspaces WHERE id = $1`,
      [id]
    );

    if (workspaceRes.rows.length === 0) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const inviteeUser = await query<{ id: string; name: string }>(
      `SELECT id, name
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [inviteeEmail]
    );

    if (inviteeUser.rows.length === 0) {
      return res.status(404).json({ message: 'No user found with this email address.' });
    }

    const alreadyMember = await query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
         AND LOWER(u.email) = LOWER($2)
       LIMIT 1`,
      [id, inviteeEmail]
    );

    if (alreadyMember.rows.length > 0) {
      return res.status(409).json({ message: 'This user is already a member of the workspace.' });
    }

    // Clear previous invite records so users can always be reinvited when not active members.
    await query(
      `DELETE FROM invitations
       WHERE workspace_id = $1
         AND LOWER(invitee_email) = LOWER($2)`,
      [id, inviteeEmail]
    );

    const created = await query<InvitationRow>(
      `INSERT INTO invitations (workspace_id, inviter_id, invitee_email, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, workspace_id, inviter_id, invitee_email, status, created_at, updated_at`,
      [id, req.userId, inviteeEmail]
    );

    await createNotification({
      userId: inviteeUser.rows[0].id,
      type: 'workspace_invite_received',
      title: 'New workspace invitation',
      message: `${me.name} invited you to ${workspaceRes.rows[0].name}.`,
      metadata: {
        workspace_id: id,
        invitation_id: created.rows[0].id,
        inviter_id: req.userId,
      },
    });

    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const emailRes = await sendWorkspaceInviteEmail({
      to: inviteeEmail,
      inviterName: me.name,
      workspaceName: workspaceRes.rows[0].name,
      appUrl,
      invitationId: created.rows[0].id,
    });

    return res.status(201).json({ invitation: created.rows[0], email_sent: emailRes.sent, email_reason: emailRes.reason || null });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ message: 'Invitation already exists for this email.' });
    }
    console.error('createInvitation error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const respondToInvitation = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { invitationId } = req.params;
  const action = req.body?.action === 'accepted' ? 'accepted' : req.body?.action === 'declined' ? 'declined' : null;
  if (!action) {
    return res.status(400).json({ message: 'Action must be accepted or declined.' });
  }

  try {
    const me = await getUserEmailAndName(req.userId);
    if (!me) return res.status(404).json({ message: 'User not found.' });

    const invitationRes = await query<InvitationRow>(
      `SELECT id, workspace_id, inviter_id, invitee_email, status, created_at, updated_at
       FROM invitations
       WHERE id = $1`,
      [invitationId]
    );

    if (invitationRes.rows.length === 0) {
      return res.status(404).json({ message: 'Invitation not found.' });
    }

    const invitation = invitationRes.rows[0];
    if (invitation.invitee_email.toLowerCase() !== me.email.toLowerCase()) {
      return res.status(403).json({ message: 'This invitation is not for your account.' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: `Invitation is already ${invitation.status}.` });
    }

    if (action === 'accepted') {
      await query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [invitation.workspace_id, req.userId]
      );
    }

    await query(
      `DELETE FROM invitations
       WHERE id = $1`,
      [invitationId]
    );

    const updatedInvitation: InvitationRow = {
      ...invitation,
      status: action,
      updated_at: new Date().toISOString(),
    };

    const workspaceRes = await query<{ name: string }>(
      `SELECT name FROM workspaces WHERE id = $1`,
      [updatedInvitation.workspace_id]
    );
    const workspaceName = workspaceRes.rows[0]?.name || 'workspace';

    await createNotification({
      userId: updatedInvitation.inviter_id,
      type: 'workspace_invite_response',
      title: action === 'accepted' ? 'Invitation accepted' : 'Invitation declined',
      message: `${me.name} ${action === 'accepted' ? 'accepted' : 'declined'} your invitation to ${workspaceName}.`,
      metadata: {
        workspace_id: updatedInvitation.workspace_id,
        invitation_id: updatedInvitation.id,
        responded_by: req.userId,
        action,
      },
    });

    return res.status(200).json({ invitation: updatedInvitation });
  } catch (err) {
    console.error('respondToInvitation error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const cancelInvitation = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { invitationId } = req.params;

  try {
    const invitationRes = await query<InvitationRow>(
      `SELECT id, workspace_id, inviter_id, invitee_email, status, created_at, updated_at
       FROM invitations
       WHERE id = $1`,
      [invitationId]
    );

    if (invitationRes.rows.length === 0) {
      return res.status(404).json({ message: 'Invitation not found.' });
    }

    const invitation = invitationRes.rows[0];
    if (invitation.inviter_id !== req.userId) {
      return res.status(403).json({ message: 'Only the sender can cancel this invitation.' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ message: `Only pending invitations can be cancelled (current: ${invitation.status}).` });
    }

    await query(
      `DELETE FROM invitations
       WHERE id = $1`,
      [invitationId]
    );

    return res.status(200).json({ message: 'Invitation cancelled.', invitation_id: invitationId });
  } catch (err) {
    console.error('cancelInvitation error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const updateWorkspaceSettings = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;
  const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
  const rawDescription = typeof req.body?.description === 'string' ? req.body.description.trim() : undefined;

  if (rawName !== undefined && rawName.length === 0) {
    return res.status(400).json({ message: 'Workspace name cannot be empty.' });
  }

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const isOwner = await ensureWorkspaceOwner(id, req.userId);
    if (!isOwner) {
      return res.status(403).json({ message: 'Only workspace owners can edit workspace settings.' });
    }

    const updated = await query<WorkspaceRow>(
      `UPDATE workspaces
       SET name = COALESCE($1, name),
           description = CASE WHEN $2::text IS NULL THEN description ELSE $2 END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id,
                 name,
                 description,
                 owner_id,
                 created_at,
                 updated_at,
                 'owner'::text AS role,
                 (
                   SELECT COUNT(*)::int
                   FROM workspace_members wm2
                   WHERE wm2.workspace_id = workspaces.id
                 ) AS member_count`,
      [rawName ?? null, rawDescription ?? null, id]
    );

    return res.status(200).json({ workspace: updated.rows[0] });
  } catch (err) {
    console.error('updateWorkspaceSettings error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const removeWorkspaceMember = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id, memberUserId } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const isOwner = await ensureWorkspaceOwner(id, req.userId);
    if (!isOwner) {
      return res.status(403).json({ message: 'Only workspace owners can remove members.' });
    }

    if (memberUserId === req.userId) {
      return res.status(400).json({ message: 'Owner cannot remove themselves from workspace.' });
    }

    const targetMember = await query<{ role: 'owner' | 'member' }>(
      `SELECT role
       FROM workspace_members
       WHERE workspace_id = $1
         AND user_id = $2`,
      [id, memberUserId]
    );

    if (targetMember.rows.length === 0) {
      return res.status(404).json({ message: 'Member not found in workspace.' });
    }

    if (targetMember.rows[0].role === 'owner') {
      const ownerCountRes = await query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM workspace_members
         WHERE workspace_id = $1
           AND role = 'owner'`,
        [id]
      );

      const ownerCount = ownerCountRes.rows[0]?.count || 0;
      if (ownerCount <= 1) {
        return res.status(400).json({ message: 'Cannot remove the last owner from workspace.' });
      }
    }

    await query(
      `DELETE FROM workspace_members
       WHERE workspace_id = $1
         AND user_id = $2`,
      [id, memberUserId]
    );

    return res.status(200).json({ message: 'Member removed.' });
  } catch (err) {
    console.error('removeWorkspaceMember error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const leaveWorkspace = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const isOwner = await ensureWorkspaceOwner(id, req.userId);
    if (isOwner) {
      const ownerCountRes = await query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM workspace_members
         WHERE workspace_id = $1
           AND role = 'owner'`,
        [id]
      );

      const ownerCount = ownerCountRes.rows[0]?.count || 0;
      if (ownerCount <= 1) {
        return res.status(400).json({ message: 'Workspace owners must assign another owner before leaving.' });
      }
    }

    await query(
      `DELETE FROM workspace_members
       WHERE workspace_id = $1
         AND user_id = $2`,
      [id, req.userId]
    );

    return res.status(200).json({ message: 'You left the workspace.', workspace_id: id });
  } catch (err) {
    console.error('leaveWorkspace error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const assignWorkspaceOwner = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id, memberUserId } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const isOwner = await ensureWorkspaceOwner(id, req.userId);
    if (!isOwner) {
      return res.status(403).json({ message: 'Only workspace owners can assign ownership.' });
    }

    const targetMember = await query<WorkspaceMemberRow>(
      `SELECT wm.id,
              wm.workspace_id,
              wm.user_id,
              wm.role,
              wm.joined_at,
              u.name,
              u.email
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
         AND wm.user_id = $2`,
      [id, memberUserId]
    );

    if (targetMember.rows.length === 0) {
      return res.status(404).json({ message: 'Member not found in workspace.' });
    }

    if (targetMember.rows[0].role === 'owner') {
      return res.status(200).json({ member: targetMember.rows[0], message: 'Member is already an owner.' });
    }

    const updated = await query<WorkspaceMemberRow>(
      `UPDATE workspace_members
       SET role = 'owner'
       WHERE workspace_id = $1
         AND user_id = $2
       RETURNING id, workspace_id, user_id, role, joined_at`,
      [id, memberUserId]
    );

    await createNotification({
      userId: memberUserId,
      type: 'workspace_owner_assigned',
      title: 'You are now a workspace owner',
      message: 'An owner assigned you as an owner in a workspace.',
      metadata: {
        workspace_id: id,
        assigned_by: req.userId,
      },
    });

    return res.status(200).json({
      member: {
        ...targetMember.rows[0],
        role: updated.rows[0]?.role || 'owner',
      },
      message: 'Ownership assigned.',
    });
  } catch (err) {
    console.error('assignWorkspaceOwner error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const removeWorkspaceOwner = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id, memberUserId } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const isOwner = await ensureWorkspaceOwner(id, req.userId);
    if (!isOwner) {
      return res.status(403).json({ message: 'Only workspace owners can remove ownership.' });
    }

    if (memberUserId === req.userId) {
      return res.status(400).json({ message: 'Use Leave workspace to remove your own ownership.' });
    }

    const targetMember = await query<WorkspaceMemberRow>(
      `SELECT wm.id,
              wm.workspace_id,
              wm.user_id,
              wm.role,
              wm.joined_at,
              u.name,
              u.email
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
         AND wm.user_id = $2`,
      [id, memberUserId]
    );

    if (targetMember.rows.length === 0) {
      return res.status(404).json({ message: 'Member not found in workspace.' });
    }

    if (targetMember.rows[0].role !== 'owner') {
      return res.status(400).json({ message: 'This member is not an owner.' });
    }

    const ownerCountRes = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM workspace_members
       WHERE workspace_id = $1
         AND role = 'owner'`,
      [id]
    );

    const ownerCount = ownerCountRes.rows[0]?.count || 0;
    if (ownerCount <= 1) {
      return res.status(400).json({ message: 'Cannot remove ownership from the last owner.' });
    }

    const updated = await query<WorkspaceMemberRow>(
      `UPDATE workspace_members
       SET role = 'member'
       WHERE workspace_id = $1
         AND user_id = $2
       RETURNING id, workspace_id, user_id, role, joined_at`,
      [id, memberUserId]
    );

    return res.status(200).json({
      member: {
        ...targetMember.rows[0],
        role: updated.rows[0]?.role || 'member',
      },
      message: 'Ownership removed.',
    });
  } catch (err) {
    console.error('removeWorkspaceOwner error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const deleteWorkspace = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const isOwner = await ensureWorkspaceOwner(id, req.userId);
    if (!isOwner) {
      return res.status(403).json({ message: 'Only workspace owners can delete workspace.' });
    }

    await query(
      `DELETE FROM workspaces
       WHERE id = $1`,
      [id]
    );

    return res.status(200).json({ message: 'Workspace deleted.', workspace_id: id });
  } catch (err) {
    console.error('deleteWorkspace error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getWorkspaceMessages = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    await query(
      `UPDATE workspace_members
       SET last_chat_seen_at = NOW()
       WHERE workspace_id = $1
         AND user_id = $2`,
      [id, req.userId]
    );

    const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 80, maxLimit: 120 });

    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM workspace_messages
       WHERE workspace_id = $1`,
      [id]
    );

    const result = await query<WorkspaceMessageRow>(
      `SELECT wm.id,
              wm.workspace_id,
              wm.user_id,
              wm.content,
              wm.created_at,
              wm.updated_at,
              u.name AS author_name,
              u.email AS author_email,
              u.avatar_url AS author_avatar_url
       FROM workspace_messages wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
       ORDER BY wm.created_at DESC
       LIMIT $2
       OFFSET $3`,
      [id, pagination.limit, pagination.offset]
    );

    const messages = [...result.rows].reverse();
    const total = totalResult.rows[0]?.total || 0;

    return res.status(200).json({
      messages,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / pagination.limit)),
        has_next: pagination.offset + result.rows.length < total,
        has_prev: pagination.page > 1,
      },
    });
  } catch (err) {
    console.error('getWorkspaceMessages error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const createWorkspaceMessage = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

  if (!content) {
    return res.status(400).json({ message: 'Message content is required.' });
  }

  if (content.length > 2000) {
    return res.status(400).json({ message: 'Message is too long.' });
  }

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const created = await query<WorkspaceMessageRow>(
      `INSERT INTO workspace_messages (workspace_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id,
                 workspace_id,
                 user_id,
                 content,
                 created_at,
                 updated_at`,
      [id, req.userId, content]
    );

    await query(
      `UPDATE workspace_members
       SET last_chat_seen_at = NOW()
       WHERE workspace_id = $1
         AND user_id = $2`,
      [id, req.userId]
    );

    const author = await query<{ name: string; email: string; avatar_url: string | null }>(
      `SELECT name, email, avatar_url
       FROM users
       WHERE id = $1`,
      [req.userId]
    );

    const message = {
      ...created.rows[0],
      author_name: author.rows[0]?.name || 'Unknown user',
      author_email: author.rows[0]?.email || '',
      author_avatar_url: author.rows[0]?.avatar_url || null,
    };

    const socketServer = getSocketServer();
    if (socketServer) {
      socketServer.to(`workspace:${id}`).emit('workspace:message:new', message);
    }

    return res.status(201).json({ message });
  } catch (err) {
    console.error('createWorkspaceMessage error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getWorkspaceUpcomingEvents = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 8, maxLimit: 25 });

    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM events
       WHERE workspace_id = $1
         AND start_time >= NOW()`,
      [id]
    );

    const result = await query<WorkspaceUpcomingEventRow>(
      `SELECT e.id,
              e.workspace_id,
              e.user_id,
              e.title,
              e.description,
              e.start_time,
              e.end_time,
              e.color,
              e.is_all_day,
              e.location,
              creator.name AS creator_name,
              creator.email AS creator_email,
              COALESCE((SELECT ep.status
                        FROM event_participants ep
                        WHERE ep.event_id = e.id
                          AND ep.user_id = $2
                        LIMIT 1), 'pending') AS participant_status,
              COALESCE((SELECT COUNT(*)::int
                        FROM event_participants ep
                        WHERE ep.event_id = e.id
                          AND ep.status = 'declined'), 0) AS not_joining_count,
              COALESCE((SELECT COUNT(*)::int
                        FROM event_participants ep
                        WHERE ep.event_id = e.id
                          AND ep.status = 'accepted'), 0) AS joining_count,
              COALESCE((SELECT COUNT(*)::int
                        FROM event_participants ep
                        WHERE ep.event_id = e.id
                          AND ep.status = 'pending'), 0) AS pending_count
       FROM events e
       INNER JOIN users creator ON creator.id = e.user_id
       WHERE e.workspace_id = $1
         AND e.start_time >= NOW()
       ORDER BY e.start_time ASC, e.updated_at DESC
       LIMIT $3
       OFFSET $4`,
      [id, req.userId, pagination.limit, pagination.offset]
    );

    const total = totalResult.rows[0]?.total || 0;
    return res.status(200).json({
      events: result.rows,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / pagination.limit)),
        has_next: pagination.offset + result.rows.length < total,
        has_prev: pagination.page > 1,
      },
    });
  } catch (err) {
    console.error('getWorkspaceUpcomingEvents error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getWorkspaceSharedNotes = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const hasAccess = await ensureWorkspaceAccess(id, req.userId);
    if (!hasAccess) {
      return res.status(404).json({ message: 'Workspace not found.' });
    }

    const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 12, maxLimit: 50 });

    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM note_shares ns
       INNER JOIN notes n ON n.id = ns.note_id
       WHERE ns.workspace_id = $1
         AND n.event_id IS NULL`,
      [id]
    );

    const result = await query<WorkspaceSharedNoteRow>(
      `SELECT n.id,
              n.user_id,
              n.title,
              n.content,
              n.note_group,
              n.is_pinned,
              n.updated_at,
              ns.permission,
              u.name AS owner_name,
              u.email AS owner_email
       FROM note_shares ns
       INNER JOIN notes n ON n.id = ns.note_id
       INNER JOIN users u ON u.id = n.user_id
       WHERE ns.workspace_id = $1
         AND n.event_id IS NULL
       ORDER BY n.is_pinned DESC, n.updated_at DESC
       LIMIT $2
       OFFSET $3`,
      [id, pagination.limit, pagination.offset]
    );

    const notes = result.rows.map((note) => ({
      ...note,
      can_edit: note.user_id === req.userId,
      access_permission: note.user_id === req.userId ? 'owner' : 'viewer',
    }));

    const total = totalResult.rows[0]?.total || 0;
    return res.status(200).json({
      notes,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / pagination.limit)),
        has_next: pagination.offset + result.rows.length < total,
        has_prev: pagination.page > 1,
      },
    });
  } catch (err) {
    console.error('getWorkspaceSharedNotes error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
