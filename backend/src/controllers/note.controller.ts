import { Response } from 'express';
import { query } from '../lib/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getSocketServer } from '../lib/socket';

interface NoteRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string | null;
  content: string;
  note_group: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  access_permission: 'owner' | 'viewer';
  access_scope: 'mine' | 'shared_by_me' | 'shared_with_me';
  shares_count: number;
  shared_workspaces: string[];
}

interface NoteShareRow {
  note_id: string;
  workspace_id: string;
  workspace_name: string;
  permission: 'viewer';
  shared_by: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceMessageRow {
  id: string;
  workspace_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface UserRow {
  name: string;
  email: string;
  avatar_url: string | null;
}

interface WorkspaceRow {
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
  const defaultLimit = defaults.limit ?? 24;
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

const BASE_SELECT = `SELECT n.id,
       n.user_id,
       n.workspace_id,
       n.title,
       n.content,
       n.note_group,
       n.is_pinned,
       n.created_at,
       n.updated_at,
       CASE
         WHEN n.user_id = $1 THEN 'owner'
         ELSE 'viewer'
       END AS access_permission,
       CASE
         WHEN n.user_id = $1 AND sbm.note_id IS NOT NULL THEN 'shared_by_me'
         WHEN n.user_id = $1 THEN 'mine'
         ELSE 'shared_with_me'
       END AS access_scope,
      COALESCE(sc.shares_count, 0)::int AS shares_count,
      COALESCE(swn.workspace_names, ARRAY[]::text[]) AS shared_workspaces
FROM notes n
LEFT JOIN shared_access sa ON sa.note_id = n.id
LEFT JOIN shared_by_me sbm ON sbm.note_id = n.id
LEFT JOIN share_counts sc ON sc.note_id = n.id
    LEFT JOIN shared_workspace_names swn ON swn.note_id = n.id
WHERE n.event_id IS NULL
  AND (n.user_id = $1 OR sa.note_id IS NOT NULL)`;

const ACCESS_CTES = `WITH member_workspaces AS (
       SELECT workspace_id
       FROM workspace_members
       WHERE user_id = $1
     ),
     shared_access AS (
       SELECT ns.note_id
       FROM note_shares ns
       INNER JOIN member_workspaces mw ON mw.workspace_id = ns.workspace_id
       GROUP BY ns.note_id
     ),
     shared_by_me AS (
       SELECT DISTINCT ns.note_id
       FROM note_shares ns
       INNER JOIN notes n ON n.id = ns.note_id
       WHERE n.user_id = $1
     ),
     share_counts AS (
       SELECT note_id, COUNT(*)::int AS shares_count
       FROM note_shares
       GROUP BY note_id
     ),
     shared_workspace_names AS (
       SELECT ns.note_id,
              ARRAY_AGG(w.name ORDER BY w.name) AS workspace_names
       FROM note_shares ns
       INNER JOIN workspaces w ON w.id = ns.workspace_id
       GROUP BY ns.note_id
     )`;

const getNoteForUser = async (noteId: string, userId: string) => {
  const result = await query<NoteRow>(
    `${ACCESS_CTES}
     ${BASE_SELECT}
       AND n.id = $2
     LIMIT 1`,
    [userId, noteId]
  );
  return result.rows[0] || null;
};

export const getNotes = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const scope = typeof req.query.scope === 'string' ? req.query.scope.trim() : 'all';
  const pinnedOnly = req.query.pinned === 'true';
  const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 24, maxLimit: 100 });

  const params: any[] = [req.userId];
  const filters: string[] = [];

  if (scope === 'mine') {
    filters.push('n.user_id = $1 AND sbm.note_id IS NULL');
  } else if (scope === 'shared_by_me') {
    filters.push('n.user_id = $1 AND sbm.note_id IS NOT NULL');
  } else if (scope === 'shared_with_me') {
    filters.push('n.user_id <> $1 AND sa.note_id IS NOT NULL');
  }

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(COALESCE(n.title, '') ILIKE $${params.length} OR n.content ILIKE $${params.length})`);
  }

  if (pinnedOnly) {
    filters.push('n.is_pinned = TRUE');
  }

  try {
    const dynamicWhere = filters.length ? ` AND ${filters.join(' AND ')}` : '';

    const countResult = await query<{ total: number }>(
      `${ACCESS_CTES}
       SELECT COUNT(*)::int AS total
       FROM notes n
       LEFT JOIN shared_access sa ON sa.note_id = n.id
       LEFT JOIN shared_by_me sbm ON sbm.note_id = n.id
       WHERE n.event_id IS NULL
         AND (n.user_id = $1 OR sa.note_id IS NOT NULL)
       ${dynamicWhere}`,
      params
    );

    const listParams = [...params, pagination.limit, pagination.offset];
    const result = await query<NoteRow>(
      `${ACCESS_CTES}
       ${BASE_SELECT}
       ${dynamicWhere}
       ORDER BY n.is_pinned DESC, n.updated_at DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams
    );

    const total = countResult.rows[0]?.total || 0;
    return res.status(200).json({
      notes: result.rows,
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
    console.error('getNotes error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getNote = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const note = await getNoteForUser(id, req.userId);
    if (!note) {
      return res.status(404).json({ message: 'Note not found.' });
    }

    return res.status(200).json({ note });
  } catch (err) {
    console.error('getNote error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const createNote = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  const noteGroup = typeof req.body?.note_group === 'string' && req.body.note_group.trim()
    ? req.body.note_group.trim()
    : 'General';
  const isPinned = Boolean(req.body?.is_pinned);
  const workspaceId = typeof req.body?.workspace_id === 'string' && req.body.workspace_id.trim()
    ? req.body.workspace_id.trim()
    : null;

  try {
    if (workspaceId) {
      const hasWorkspaceAccess = await query<{ ok: number }>(
        `SELECT 1 AS ok
         FROM workspace_members
         WHERE workspace_id = $1
           AND user_id = $2`,
        [workspaceId, req.userId]
      );

      if (hasWorkspaceAccess.rows.length === 0) {
        return res.status(403).json({ message: 'You are not a member of this collaboration group.' });
      }
    }

    const result = await query<NoteRow>(
      `INSERT INTO notes (user_id, workspace_id, event_id, note_type, note_date, title, content, note_group, is_pinned)
       VALUES ($1, $2, NULL, 'daily', NULL, $3, $4, $5, $6)
       RETURNING id, user_id, workspace_id, title, content, note_group, is_pinned, created_at, updated_at,
                 'owner'::text AS access_permission,
                 'mine'::text AS access_scope,
                 0::int AS shares_count,
                 ARRAY[]::text[] AS shared_workspaces`,
      [req.userId, workspaceId, title || null, content, noteGroup, isPinned]
    );

    return res.status(201).json({ note: result.rows[0] });
  } catch (err) {
    console.error('createNote error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const updateNote = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined;
  const content = typeof req.body?.content === 'string' ? req.body.content : undefined;
  const noteGroup = typeof req.body?.note_group === 'string' ? req.body.note_group.trim() : undefined;
  const isPinned = typeof req.body?.is_pinned === 'boolean' ? req.body.is_pinned : undefined;
  const workspaceId = typeof req.body?.workspace_id === 'string' ? req.body.workspace_id.trim() : undefined;

  if (
    title === undefined
    && content === undefined
    && noteGroup === undefined
    && isPinned === undefined
    && workspaceId === undefined
  ) {
    return res.status(400).json({ message: 'Nothing to update.' });
  }

  try {
    const current = await getNoteForUser(id, req.userId);
    if (!current) {
      return res.status(404).json({ message: 'Note not found.' });
    }
    if (current.access_permission === 'viewer') {
      const hasNonPinChanges = (
        title !== undefined
        || content !== undefined
        || noteGroup !== undefined
        || workspaceId !== undefined
      );

      if (hasNonPinChanges) {
        return res.status(403).json({ message: 'You can pin this shared note, but cannot edit its content.' });
      }

      if (isPinned === undefined) {
        return res.status(400).json({ message: 'Nothing to update.' });
      }
    }
  } catch (err) {
    console.error('updateNote access error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (title !== undefined) {
    params.push(title || null);
    updates.push(`title = $${params.length}`);
  }

  if (content !== undefined) {
    params.push(content);
    updates.push(`content = $${params.length}`);
  }

  if (noteGroup !== undefined) {
    params.push(noteGroup || 'General');
    updates.push(`note_group = $${params.length}`);
  }

  if (isPinned !== undefined) {
    params.push(isPinned);
    updates.push(`is_pinned = $${params.length}`);
  }

  if (workspaceId !== undefined) {
    params.push(workspaceId || null);
    updates.push(`workspace_id = $${params.length}`);
  }

  const shouldTouchUpdatedAt = (
    title !== undefined
    || content !== undefined
    || noteGroup !== undefined
    || workspaceId !== undefined
  );

  if (shouldTouchUpdatedAt) {
    updates.push('updated_at = NOW()');
  }

  params.push(id);

  try {
    const result = await query<NoteRow>(
      `UPDATE notes
       SET ${updates.join(', ')}
       WHERE id = $${params.length} AND event_id IS NULL
       RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Note not found.' });
    }

    const updated = await getNoteForUser(id, req.userId);
    if (!updated) {
      return res.status(404).json({ message: 'Note not found.' });
    }

    return res.status(200).json({ note: updated });
  } catch (err) {
    console.error('updateNote error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const deleteNote = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const current = await getNoteForUser(id, req.userId);
    if (!current) {
      return res.status(404).json({ message: 'Note not found.' });
    }
    if (current.access_permission !== 'owner') {
      return res.status(403).json({ message: 'Only note owner can delete this note.' });
    }

    const result = await query<NoteRow>(
      `DELETE FROM notes
       WHERE id = $1 AND event_id IS NULL
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Note not found.' });
    }

    return res.status(200).json({ message: 'Note deleted.' });
  } catch (err) {
    console.error('deleteNote error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getNoteShares = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const current = await getNoteForUser(id, req.userId);
    if (!current) {
      return res.status(404).json({ message: 'Note not found.' });
    }
    if (current.access_permission !== 'owner') {
      return res.status(403).json({ message: 'Only note owner can view sharing settings.' });
    }

    const result = await query<NoteShareRow>(
      `SELECT ns.note_id,
              ns.workspace_id,
              w.name AS workspace_name,
              ns.permission,
              ns.shared_by,
              ns.created_at,
              ns.updated_at
       FROM note_shares ns
       INNER JOIN workspaces w ON w.id = ns.workspace_id
       WHERE ns.note_id = $1
       ORDER BY ns.updated_at DESC`,
      [id]
    );

    return res.status(200).json({ shares: result.rows });
  } catch (err) {
    console.error('getNoteShares error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const shareNoteToWorkspace = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;
  const workspaceId = typeof req.body?.workspace_id === 'string' ? req.body.workspace_id.trim() : '';
  const permission: 'viewer' = 'viewer';

  if (!workspaceId) {
    return res.status(400).json({ message: 'Workspace is required.' });
  }

  try {
    const current = await getNoteForUser(id, req.userId);
    if (!current) {
      return res.status(404).json({ message: 'Note not found.' });
    }
    if (current.access_permission !== 'owner') {
      return res.status(403).json({ message: 'Only note owner can share this note.' });
    }

    const workspaceAccess = await query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM workspace_members
       WHERE workspace_id = $1
         AND user_id = $2`,
      [workspaceId, req.userId]
    );

    if (workspaceAccess.rows.length === 0) {
      return res.status(403).json({ message: 'You can only share notes to your collaboration groups.' });
    }

    const existingShare = await query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM note_shares
       WHERE note_id = $1
         AND workspace_id = $2`,
      [id, workspaceId]
    );

    const share = await query<NoteShareRow>(
      `INSERT INTO note_shares (note_id, workspace_id, permission, shared_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (note_id, workspace_id)
       DO UPDATE
         SET permission = EXCLUDED.permission,
             shared_by = EXCLUDED.shared_by,
             updated_at = NOW()
       RETURNING note_id, workspace_id, permission, shared_by, created_at, updated_at`,
      [id, workspaceId, permission, req.userId]
    );

    if (existingShare.rows.length === 0) {
      const [workspaceRes, userRes] = await Promise.all([
        query<WorkspaceRow>(
          `SELECT name
           FROM workspaces
           WHERE id = $1`,
          [workspaceId]
        ),
        query<UserRow>(
          `SELECT name, email, avatar_url
           FROM users
           WHERE id = $1`,
          [req.userId]
        ),
      ]);

      const workspaceName = workspaceRes.rows[0]?.name || 'Workspace';
      const author = userRes.rows[0];
      const title = current.title?.trim() || 'Untitled';

      const created = await query<WorkspaceMessageRow>(
        `INSERT INTO workspace_messages (workspace_id, user_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, workspace_id, user_id, content, created_at, updated_at`,
        [workspaceId, req.userId, `${author?.name || 'A teammate'} shared a note in ${workspaceName}: ${title}`]
      );

      const socketServer = getSocketServer();
      if (socketServer) {
        socketServer.to(`workspace:${workspaceId}`).emit('workspace:message:new', {
          ...created.rows[0],
          author_name: author?.name || 'Unknown user',
          author_email: author?.email || '',
          author_avatar_url: author?.avatar_url || null,
        });
      }
    }

    return res.status(200).json({ share: share.rows[0] });
  } catch (err) {
    console.error('shareNoteToWorkspace error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const unshareNoteFromWorkspace = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id, workspaceId } = req.params;

  try {
    const current = await getNoteForUser(id, req.userId);
    if (!current) {
      return res.status(404).json({ message: 'Note not found.' });
    }
    if (current.access_permission !== 'owner') {
      return res.status(403).json({ message: 'Only note owner can change sharing settings.' });
    }

    await query(
      `DELETE FROM note_shares
       WHERE note_id = $1
         AND workspace_id = $2`,
      [id, workspaceId]
    );

    return res.status(200).json({ message: 'Note unshared.' });
  } catch (err) {
    console.error('unshareNoteFromWorkspace error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
