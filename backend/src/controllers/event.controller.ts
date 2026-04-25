import { Response } from 'express';
import { randomUUID } from 'crypto';
import { query } from '../lib/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getSocketServer } from '../lib/socket';

interface EventRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  event_type: string;
  color: string;
  is_all_day: boolean;
  location: string | null;
  series_id: string | null;
  recurrence_rule: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_interval: number;
  recurrence_until: string | null;
  recurrence_parent_id: string | null;
  recurrence_index: number;
  can_edit?: boolean;
  can_delete?: boolean;
  participant_status?: 'pending' | 'accepted' | 'declined' | null;
  participant_decline_reason?: string | null;
}

interface WorkspaceMemberRow {
  user_id: string;
  role: 'owner' | 'member';
}

interface EventAccessRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string;
  start_time: string;
  end_time: string;
  series_id: string | null;
  recurrence_rule: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_parent_id: string | null;
  workspace_role: 'owner' | 'member' | null;
}

interface EventParticipantRow {
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  status: 'pending' | 'accepted' | 'declined';
  decline_reason: string | null;
  responded_at: string | null;
  is_creator: boolean;
}

interface WorkspaceUpcomingEventRow {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  event_type: string;
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

interface WorkspaceRow {
  owner_id: string;
  name: string;
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

interface OpenSeriesSeedRow {
  id: string;
  series_id: string | null;
  user_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  event_type: string;
  color: string;
  is_all_day: boolean;
  location: string | null;
  recurrence_rule: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_interval: number;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  important: '#ef4444',
  work: '#f97316',
  personal: '#3b82f6',
  team: '#8b5cf6',
  interests: '#22c55e',
  hobby: '#22c55e',
  health: '#14b8a6',
  general: '#6366f1',
};

function normalizeEventType(value: unknown): string {
  if (typeof value !== 'string') return 'personal';
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'personal';
}

function inferEventTypeFromColor(value: unknown): string {
  if (typeof value !== 'string') return 'personal';
  const normalized = value.toLowerCase();
  const pair = Object.entries(EVENT_TYPE_COLORS).find(([, color]) => color.toLowerCase() === normalized);
  return pair?.[0] || 'personal';
}

interface SeriesLastOccurrenceRow {
  start_time: string;
  end_time: string;
  recurrence_index: number;
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
  const defaultLimit = defaults.limit ?? 120;
  const maxLimit = defaults.maxLimit ?? 500;

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

async function findEventCollisions(params: {
  userId: string;
  startTime: string;
  endTime: string;
  excludeEventId?: string | null;
}) {
  const result = await query<EventRow>(
    `SELECT id, user_id, workspace_id, title, start_time, end_time
     FROM events
     WHERE user_id = $1
       AND tstzrange(start_time, end_time, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')
       AND ($4::uuid IS NULL OR id <> $4)
     ORDER BY start_time ASC
     LIMIT 10`,
    [params.userId, params.startTime, params.endTime, params.excludeEventId || null]
  );
  return result.rows;
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

function isValidDateRange(startTime: string, endTime: string) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start < end;
}

function normalizeRecurrenceRule(value: unknown): 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' {
  if (value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'yearly') return value;
  return 'none';
}

function normalizeRecurrenceInterval(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  const normalized = Math.trunc(parsed);
  return Math.max(1, Math.min(normalized, 30));
}

function addRecurrenceStep(baseDate: Date, rule: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly', interval: number) {
  const next = new Date(baseDate);
  if (rule === 'daily') next.setDate(next.getDate() + interval);
  if (rule === 'weekly') next.setDate(next.getDate() + (interval * 7));
  if (rule === 'monthly') next.setMonth(next.getMonth() + interval);
  if (rule === 'yearly') next.setFullYear(next.getFullYear() + interval);
  return next;
}

function buildRecurringOccurrences(params: {
  startTime: string;
  endTime: string;
  recurrenceRule: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrenceInterval: number;
  recurrenceUntil: string | null;
}) {
  const maxOccurrences = 200;
  const occurrences: Array<{ start: string; end: string; index: number }> = [
    { start: params.startTime, end: params.endTime, index: 0 },
  ];

  if (params.recurrenceRule === 'none' || !params.recurrenceUntil) {
    return occurrences;
  }

  const recurrenceUntilTs = new Date(params.recurrenceUntil).getTime();
  let nextStart = new Date(params.startTime);
  let nextEnd = new Date(params.endTime);

  while (occurrences.length < maxOccurrences) {
    nextStart = addRecurrenceStep(nextStart, params.recurrenceRule, params.recurrenceInterval);
    nextEnd = addRecurrenceStep(nextEnd, params.recurrenceRule, params.recurrenceInterval);

    if (nextStart.getTime() > recurrenceUntilTs) {
      break;
    }

    occurrences.push({
      start: nextStart.toISOString(),
      end: nextEnd.toISOString(),
      index: occurrences.length,
    });
  }

  return occurrences;
}

async function ensureOpenSeriesCoverage(params: { userId: string; to: string | null }) {
  if (!params.to) return;

  const toTs = new Date(params.to).getTime();
  if (!Number.isFinite(toTs)) return;

  // Keep generation bounded: extend only a little beyond visible range, in capped batches.
  const targetDate = new Date(toTs);
  targetDate.setMonth(targetDate.getMonth() + 3);
  const targetTs = targetDate.getTime();
  const maxNewPerSeries = 120;

  const seeds = await query<OpenSeriesSeedRow>(
    `SELECT DISTINCT ON (COALESCE(e.series_id, e.id))
            e.id,
            e.series_id,
            e.user_id,
            e.workspace_id,
            e.title,
            e.description,
            e.color,
            e.event_type,
            e.is_all_day,
            e.location,
            e.recurrence_rule,
            e.recurrence_interval
     FROM events e
     LEFT JOIN workspace_members wm
       ON wm.workspace_id = e.workspace_id
      AND wm.user_id = $1
     WHERE (e.user_id = $1 OR wm.user_id = $1)
       AND e.recurrence_rule <> 'none'
       AND e.recurrence_until IS NULL
       AND e.recurrence_index = 0
     ORDER BY COALESCE(e.series_id, e.id), e.start_time ASC`,
    [params.userId]
  );

  for (const seed of seeds.rows) {
    const seriesKey = seed.series_id || seed.id;

    const lastOccurrence = await query<SeriesLastOccurrenceRow>(
      `SELECT start_time, end_time, recurrence_index
       FROM events
       WHERE series_id = $1 OR id = $2
       ORDER BY recurrence_index DESC
       LIMIT 1`,
      [seriesKey, seed.id]
    );

    const last = lastOccurrence.rows[0];
    if (!last) continue;

    let nextStart = new Date(last.start_time);
    let nextEnd = new Date(last.end_time);
    let nextIndex = last.recurrence_index;
    let createdCount = 0;

    while (nextStart.getTime() < targetTs && createdCount < maxNewPerSeries) {
      nextStart = addRecurrenceStep(nextStart, seed.recurrence_rule, seed.recurrence_interval);
      nextEnd = addRecurrenceStep(nextEnd, seed.recurrence_rule, seed.recurrence_interval);
      nextIndex += 1;

      const inserted = await query<EventRow>(
        `INSERT INTO events
           (user_id, workspace_id, title, description, start_time, end_time, event_type, color, is_all_day, location, series_id, source, is_imported,
            recurrence_rule, recurrence_interval, recurrence_until, recurrence_parent_id, recurrence_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'planora', false, $12, $13, NULL, $14, $15)
         RETURNING id`,
        [
          seed.user_id,
          seed.workspace_id,
          seed.title,
          seed.description,
          nextStart.toISOString(),
          nextEnd.toISOString(),
          seed.event_type || inferEventTypeFromColor(seed.color),
          seed.color,
          seed.is_all_day,
          seed.location,
          seriesKey,
          seed.recurrence_rule,
          seed.recurrence_interval,
          seed.id,
          nextIndex,
        ]
      );

      if (seed.workspace_id && inserted.rows[0]?.id) {
        await seedWorkspaceEventParticipants(inserted.rows[0].id, seed.workspace_id, seed.user_id);
      }

      createdCount += 1;
    }
  }
}

async function getWorkspace(params: { workspaceId: string }) {
  const result = await query<WorkspaceRow>(
    `SELECT owner_id, name
     FROM workspaces
     WHERE id = $1`,
    [params.workspaceId]
  );
  return result.rows[0] || null;
}

async function getWorkspaceMembers(workspaceId: string) {
  const result = await query<WorkspaceMemberRow>(
    `SELECT user_id, role
     FROM workspace_members
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  return result.rows;
}

async function ensureWorkspaceAccess(workspaceId: string, userId: string) {
  const access = await query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM workspace_members
     WHERE workspace_id = $1
       AND user_id = $2`,
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

async function loadEventAccess(eventId: string, userId: string) {
  const result = await query<EventAccessRow>(
    `SELECT e.id,
            e.user_id,
            e.workspace_id,
            e.title,
            e.start_time,
            e.end_time,
            e.series_id,
            e.recurrence_rule,
            e.recurrence_parent_id,
            wm.role AS workspace_role
     FROM events e
     LEFT JOIN workspace_members wm
       ON wm.workspace_id = e.workspace_id
      AND wm.user_id = $2
     WHERE e.id = $1`,
    [eventId, userId]
  );

  return result.rows[0] || null;
}

async function seedWorkspaceEventParticipants(eventId: string, workspaceId: string, creatorUserId: string) {
  const members = await getWorkspaceMembers(workspaceId);
  if (members.length === 0) return;

  const values: Array<string | null> = [];
  const placeholders: string[] = [];

  members.forEach((member, index) => {
    const offset = index * 4;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
    values.push(eventId, member.user_id, member.user_id === creatorUserId ? 'accepted' : 'pending', null);
  });

  await query(
    `INSERT INTO event_participants (event_id, user_id, status, decline_reason)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (event_id, user_id)
     DO UPDATE SET
       status = EXCLUDED.status,
       decline_reason = NULL,
       responded_at = CASE WHEN EXCLUDED.status = 'pending' THEN NULL ELSE NOW() END`,
    values
  );
}

async function postWorkspaceEventMessage(params: {
  workspaceId: string;
  userId: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  occurrenceCount?: number;
  recurrenceRule?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
}) {
  const isSeries = (params.occurrenceCount || 1) > 1;
  const recurrenceText = isSeries && params.recurrenceRule && params.recurrenceRule !== 'none'
    ? ` · repeats ${params.recurrenceRule} (${params.occurrenceCount} events)`
    : '';

  const created = await query<WorkspaceMessageRow>(
    `INSERT INTO workspace_messages (workspace_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING id,
               workspace_id,
               user_id,
               content,
               created_at,
               updated_at`,
    [
      params.workspaceId,
      params.userId,
      `Created a group event: "${params.title}" (${new Date(params.startTime).toLocaleString()} - ${new Date(params.endTime).toLocaleString()})${params.location ? ` · ${params.location}` : ''}${recurrenceText}`,
    ]
  );

  const author = await query<{ name: string; email: string; avatar_url: string | null }>(
    `SELECT name, email, avatar_url
     FROM users
     WHERE id = $1`,
    [params.userId]
  );

  const message = {
    ...created.rows[0],
    author_name: author.rows[0]?.name || 'Unknown user',
    author_email: author.rows[0]?.email || '',
    author_avatar_url: author.rows[0]?.avatar_url || null,
  };

  const socketServer = getSocketServer();
  if (socketServer) {
    socketServer.to(`workspace:${params.workspaceId}`).emit('workspace:message:new', message);
  }
}

// ─── GET ALL EVENTS (for current user) ──────────────────
export const getEvents = async (req: AuthRequest, res: Response) => {
  try {
    const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 120, maxLimit: 500 });
    const from = typeof req.query.from === 'string' && req.query.from.trim() ? req.query.from.trim() : null;
    const to = typeof req.query.to === 'string' && req.query.to.trim() ? req.query.to.trim() : null;

    if (from && !Number.isFinite(new Date(from).getTime())) {
      return res.status(400).json({ message: 'Invalid from date.' });
    }
    if (to && !Number.isFinite(new Date(to).getTime())) {
      return res.status(400).json({ message: 'Invalid to date.' });
    }

    await ensureOpenSeriesCoverage({ userId: req.userId!, to });

    const filters: string[] = [];
    const params: any[] = [req.userId];

    if (from) {
      params.push(from);
      filters.push(`e.end_time >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      filters.push(`e.start_time <= $${params.length}::timestamptz`);
    }

    const filterClause = filters.length ? ` AND ${filters.join(' AND ')}` : '';

    const countParams = [...params];
    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM events e
       LEFT JOIN workspace_members wm
         ON wm.workspace_id = e.workspace_id
        AND wm.user_id = $1
       WHERE (e.user_id = $1 OR wm.user_id = $1)
       ${filterClause}`,
      countParams
    );

    const listParams = [...params, pagination.limit, pagination.offset];
    const result = await query(
      `SELECT e.*,
              CASE
                WHEN e.workspace_id IS NULL THEN (e.user_id = $1)
                ELSE (e.user_id = $1 OR wm.role = 'owner')
              END AS can_edit,
              CASE
                WHEN e.workspace_id IS NULL THEN (e.user_id = $1)
                ELSE (e.user_id = $1 OR wm.role = 'owner')
              END AS can_delete,
              ep.status AS participant_status,
              ep.decline_reason AS participant_decline_reason
       FROM events e
       LEFT JOIN workspace_members wm
         ON wm.workspace_id = e.workspace_id
        AND wm.user_id = $1
       LEFT JOIN event_participants ep
         ON ep.event_id = e.id
        AND ep.user_id = $1
       WHERE (e.user_id = $1 OR wm.user_id = $1)
       ${filterClause}
       ORDER BY e.start_time ASC, e.updated_at DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams
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
    console.error('getEvents error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── GET SINGLE EVENT ────────────────────────────────────
export const getEvent = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT e.*,
              CASE
                WHEN e.workspace_id IS NULL THEN (e.user_id = $2)
                ELSE (e.user_id = $2 OR wm.role = 'owner')
              END AS can_edit,
              CASE
                WHEN e.workspace_id IS NULL THEN (e.user_id = $2)
                ELSE (e.user_id = $2 OR wm.role = 'owner')
              END AS can_delete,
              ep.status AS participant_status,
              ep.decline_reason AS participant_decline_reason
       FROM events e
       LEFT JOIN workspace_members wm
         ON wm.workspace_id = e.workspace_id
        AND wm.user_id = $2
       LEFT JOIN event_participants ep
         ON ep.event_id = e.id
        AND ep.user_id = $2
       WHERE e.id = $1
         AND (e.user_id = $2 OR wm.user_id = $2)`,
      [id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    return res.status(200).json({ event: result.rows[0] });
  } catch (err) {
    console.error('getEvent error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── CREATE EVENT ────────────────────────────────────────
export const createEvent = async (req: AuthRequest, res: Response) => {
  const {
    title,
    description,
    start_time,
    end_time,
    event_type,
    color,
    is_all_day,
    location,
    workspace_id,
    recurrence_rule,
    recurrence_interval,
    recurrence_until,
  } = req.body;

  if (!title || !start_time || !end_time) {
    return res.status(400).json({ message: 'Title, start time and end time are required.' });
  }

  if (!isValidDateRange(start_time, end_time)) {
    return res.status(400).json({ message: 'Event end time must be after start time.' });
  }

  try {
    const workspaceId = typeof workspace_id === 'string' && workspace_id.trim() ? workspace_id.trim() : null;
    const eventType = normalizeEventType(event_type || inferEventTypeFromColor(color));
    const resolvedColor = typeof color === 'string' && color.trim() ? color : (EVENT_TYPE_COLORS[eventType] || EVENT_TYPE_COLORS.important);
    const recurrenceRule = normalizeRecurrenceRule(recurrence_rule);
    const recurrenceInterval = normalizeRecurrenceInterval(recurrence_interval);
    const recurrenceUntil = recurrenceRule === 'none'
      ? null
      : (typeof recurrence_until === 'string' && recurrence_until.trim() ? recurrence_until : null);

    if (recurrenceUntil && !Number.isFinite(new Date(recurrenceUntil).getTime())) {
      return res.status(400).json({ message: 'Repeat end date is invalid.' });
    }

    if (recurrenceUntil && new Date(recurrenceUntil).getTime() <= new Date(start_time).getTime()) {
      return res.status(400).json({ message: 'Repeat end date must be after event start.' });
    }

    if (workspaceId) {
      const workspace = await getWorkspace({ workspaceId });
      if (!workspace) {
        return res.status(404).json({ message: 'Workspace not found.' });
      }

      const hasAccess = await ensureWorkspaceAccess(workspaceId, req.userId!);
      if (!hasAccess) {
        return res.status(403).json({ message: 'Only workspace members can create shared events.' });
      }
    }

    const occurrences = buildRecurringOccurrences({
      startTime: start_time,
      endTime: end_time,
      recurrenceRule,
      recurrenceInterval,
      recurrenceUntil,
    });

    const createdEvents: EventRow[] = [];
    let recurrenceParentId: string | null = null;
    const seriesId = randomUUID();

    for (const occurrence of occurrences) {
      const inserted: { rows: EventRow[]; rowCount: number | null } = await query<EventRow>(
        `INSERT INTO events
           (user_id, workspace_id, title, description, start_time, end_time, event_type, color, is_all_day, location, series_id, source, is_imported,
            recurrence_rule, recurrence_interval, recurrence_until, recurrence_parent_id, recurrence_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'planora', false, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          req.userId,
          workspaceId,
          title,
          description || null,
          occurrence.start,
          occurrence.end,
          eventType,
          resolvedColor,
          is_all_day || false,
          location || null,
          seriesId,
          recurrenceRule,
          recurrenceInterval,
          recurrenceUntil,
          occurrence.index === 0 ? null : recurrenceParentId,
          occurrence.index,
        ]
      );

      const created: EventRow = inserted.rows[0];
      if (occurrence.index === 0) {
        recurrenceParentId = created.id;
      }
      createdEvents.push(created);

      if (workspaceId) {
        await seedWorkspaceEventParticipants(created.id, workspaceId, req.userId!);
      }
    }

    const createdEvent = createdEvents[0];
    if (workspaceId) {
      const members = await getWorkspaceMembers(workspaceId);
      const participantIds = members
        .filter((member) => member.user_id !== req.userId)
        .map((member) => member.user_id);

      const workspace = await getWorkspace({ workspaceId });
      await Promise.all(
        participantIds.map((participantId) =>
          createNotification({
            userId: participantId,
            type: 'workspace_event_created',
            title: 'Collaboration event created',
            message: `A new${createdEvents.length > 1 ? ' recurring' : ''} event, "${createdEvent.title}", was created in the collaboration group "${workspace?.name || 'your collaboration'}".`,
            metadata: {
              target: 'workspace_calendar',
              workspace_id: workspaceId,
              event_id: createdEvent.id,
              created_count: createdEvents.length,
            },
          })
        )
      );

      await postWorkspaceEventMessage({
        workspaceId,
        userId: req.userId!,
        title: createdEvent.title,
        startTime: createdEvent.start_time,
        endTime: createdEvent.end_time,
        location: createdEvent.location,
        occurrenceCount: createdEvents.length,
        recurrenceRule,
      });
    }

    const collisions = await findEventCollisions({
      userId: req.userId!,
      startTime: createdEvent.start_time,
      endTime: createdEvent.end_time,
      excludeEventId: createdEvent.id,
    });

    if (collisions.length > 0) {
      await createNotification({
        userId: req.userId!,
        type: 'event_collision',
        title: 'Event conflict detected',
        message: `"${createdEvent.title}" overlaps with ${collisions.length} existing event${collisions.length > 1 ? 's' : ''}.`,
        metadata: {
          target: 'workspace_calendar',
          event_id: createdEvent.id,
          workspace_id: createdEvent.workspace_id,
          collision_event_ids: collisions.map((event) => event.id),
        },
      });
    }

    return res.status(201).json({
      event: { ...createdEvent, can_edit: true, can_delete: true },
      events: createdEvents.map(e => ({ ...e, can_edit: true, can_delete: true })),
      created_count: createdEvents.length,
      collisions
    });
  } catch (err) {
    console.error('createEvent error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── UPDATE EVENT ────────────────────────────────────────
export const updateEvent = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    title,
    description,
    start_time,
    end_time,
    event_type,
    color,
    is_all_day,
    location,
    recurrence_rule,
    recurrence_interval,
    recurrence_until,
    apply_scope,
  } = req.body;

  try {
    const existing = await loadEventAccess(id, req.userId!);
    if (!existing) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    const isWorkspaceOwner = existing.workspace_id
      ? await ensureWorkspaceOwner(existing.workspace_id, req.userId!)
      : false;

    if (existing.workspace_id) {
      if (!(isWorkspaceOwner || existing.user_id === req.userId)) {
        return res.status(403).json({ message: 'Only workspace owners or event creators can edit group events.' });
      }
    } else if (existing.user_id !== req.userId) {
      return res.status(403).json({ message: 'Only event owner can edit this event.' });
    }

    const applyScope: 'single' | 'series' = apply_scope === 'series' ? 'series' : 'single';
    const seriesRootId = existing.series_id || existing.recurrence_parent_id || existing.id;
    const isRecurringSeries = existing.recurrence_rule !== 'none' || !!existing.recurrence_parent_id;
    const shouldApplySeries = applyScope === 'series' && isRecurringSeries;

    const nextStartTime = start_time || existing.start_time;
    const nextEndTime = end_time || existing.end_time;
    if (!isValidDateRange(nextStartTime, nextEndTime)) {
      return res.status(400).json({ message: 'Event end time must be after start time.' });
    }

    const nextRecurrenceRule = recurrence_rule === undefined
      ? undefined
      : normalizeRecurrenceRule(recurrence_rule);
    const nextRecurrenceInterval = recurrence_interval === undefined
      ? undefined
      : normalizeRecurrenceInterval(recurrence_interval);
    const nextRecurrenceUntil = recurrence_until === undefined
      ? undefined
      : (typeof recurrence_until === 'string' && recurrence_until.trim() ? recurrence_until : null);
    const recurrenceUntilProvided = recurrence_until !== undefined;
    const eventTypeProvided = event_type !== undefined;
    const normalizedEventType = eventTypeProvided
      ? normalizeEventType(event_type)
      : undefined;
    const nextColor = color === undefined
      ? (normalizedEventType ? (EVENT_TYPE_COLORS[normalizedEventType] || EVENT_TYPE_COLORS.important) : undefined)
      : color;
    const descriptionProvided = description !== undefined;
    const normalizedDescription = description === undefined ? undefined : (description === '' ? null : description);

    if (nextRecurrenceUntil && !Number.isFinite(new Date(nextRecurrenceUntil).getTime())) {
      return res.status(400).json({ message: 'Repeat end date is invalid.' });
    }

    if (nextRecurrenceUntil && new Date(nextRecurrenceUntil).getTime() <= new Date(nextStartTime).getTime()) {
      return res.status(400).json({ message: 'Repeat end date must be after event start.' });
    }

    const baseUpdateParams = [
      title,
      normalizedDescription,
      start_time,
      end_time,
      nextColor,
      is_all_day,
      location,
      nextRecurrenceRule,
      nextRecurrenceInterval,
      nextRecurrenceUntil,
      recurrenceUntilProvided,
      eventTypeProvided,
      normalizedEventType,
      descriptionProvided,
      id,
      shouldApplySeries,
      seriesRootId,
    ];

    const result = existing.workspace_id && isWorkspaceOwner
      ? await query<EventRow>(
        `UPDATE events
         SET title = COALESCE($1, title),
             description = CASE WHEN $14::boolean THEN $2 ELSE description END,
             start_time = COALESCE($3, start_time),
             end_time = COALESCE($4, end_time),
             color = COALESCE($5, color),
             is_all_day = COALESCE($6, is_all_day),
             location = COALESCE($7, location),
             recurrence_rule = COALESCE($8, recurrence_rule),
             recurrence_interval = COALESCE($9, recurrence_interval),
             recurrence_until = CASE WHEN $11::boolean THEN $10 ELSE recurrence_until END,
             event_type = CASE WHEN $12::boolean THEN $13 ELSE event_type END,
             updated_at = NOW()
         WHERE workspace_id = $18
           AND (
             ($16::boolean = false AND id = $15)
             OR
             ($16::boolean = true AND (series_id = $17 OR recurrence_parent_id = $17 OR id = $17))
           )
         RETURNING *`,
        [...baseUpdateParams, existing.workspace_id]
      )
      : await query<EventRow>(
        `UPDATE events
         SET title = COALESCE($1, title),
             description = CASE WHEN $14::boolean THEN $2 ELSE description END,
             start_time = COALESCE($3, start_time),
             end_time = COALESCE($4, end_time),
             color = COALESCE($5, color),
             is_all_day = COALESCE($6, is_all_day),
             location = COALESCE($7, location),
             recurrence_rule = COALESCE($8, recurrence_rule),
             recurrence_interval = COALESCE($9, recurrence_interval),
             recurrence_until = CASE WHEN $11::boolean THEN $10 ELSE recurrence_until END,
             event_type = CASE WHEN $12::boolean THEN $13 ELSE event_type END,
             updated_at = NOW()
         WHERE user_id = $18
           AND (
             ($16::boolean = false AND id = $15)
             OR
             ($16::boolean = true AND (series_id = $17 OR recurrence_parent_id = $17 OR id = $17))
           )
         RETURNING *`,
        [...baseUpdateParams, req.userId]
      );

    const updatedEvents = result.rows;
    if (updatedEvents.length === 0) {
      return res.status(404).json({ message: 'No events found to update for the selected scope.' });
    }
    const updatedEvent = updatedEvents[0] as EventRow;
    const existingStartMs = new Date(existing.start_time).getTime();
    const existingEndMs = new Date(existing.end_time).getTime();
    const requestedStartMs = typeof start_time === 'string' ? new Date(start_time).getTime() : existingStartMs;
    const requestedEndMs = typeof end_time === 'string' ? new Date(end_time).getTime() : existingEndMs;
    const timeChanged = requestedStartMs !== existingStartMs || requestedEndMs !== existingEndMs;

    if (updatedEvent.workspace_id && timeChanged) {
      const workspace = await getWorkspace({ workspaceId: updatedEvent.workspace_id });
      const participantRows = await query<{ user_id: string }>(
        `SELECT wm.user_id
         FROM workspace_members wm
         WHERE wm.workspace_id = $1
           AND wm.user_id <> $2`,
        [updatedEvent.workspace_id, updatedEvent.user_id]
      );

      const participantIds = participantRows.rows.map((row) => row.user_id);

      await Promise.all(
        participantIds.map((participantId) =>
          createNotification({
            userId: participantId,
            type: 'workspace_event_updated',
            title: 'Collaboration event updated',
            message: `The time for "${updatedEvent.title}" changed in the collaboration group "${workspace?.name || 'your collaboration'}".`,
            metadata: {
              target: 'workspace_calendar',
              workspace_id: updatedEvent.workspace_id,
              event_id: updatedEvent.id,
            },
          })
        )
      );
    }
    const collisions = await findEventCollisions({
      userId: req.userId!,
      startTime: updatedEvent.start_time,
      endTime: updatedEvent.end_time,
      excludeEventId: updatedEvent.id,
    });

    if (collisions.length > 0) {
      await createNotification({
        userId: req.userId!,
        type: 'event_collision',
        title: 'Event conflict detected',
        message: `"${updatedEvent.title}" overlaps with ${collisions.length} existing event${collisions.length > 1 ? 's' : ''}.`,
        metadata: {
          target: 'workspace_calendar',
          event_id: updatedEvent.id,
          workspace_id: updatedEvent.workspace_id,
          collision_event_ids: collisions.map((event) => event.id),
        },
      });
    }

    return res.status(200).json({
      event: { ...updatedEvent, can_edit: true, can_delete: true },
      events: updatedEvents.map(e => ({ ...e, can_edit: true, can_delete: true })),
      updated_count: updatedEvents.length,
      collisions
    });
  } catch (err) {
    console.error('updateEvent error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── DELETE EVENT ────────────────────────────────────────
export const deleteEvent = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const scope = req.query.scope === 'series' ? 'series' : 'single';
  try {
    const existing = await loadEventAccess(id, req.userId!);

    if (!existing) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    const isWorkspaceOwner = existing.workspace_id
      ? await ensureWorkspaceOwner(existing.workspace_id, req.userId!)
      : false;

    if (existing.workspace_id) {
      if (!(isWorkspaceOwner || existing.user_id === req.userId)) {
        return res.status(403).json({ message: 'Only workspace owners or event creators can delete group events.' });
      }
    } else if (existing.user_id !== req.userId) {
      return res.status(403).json({ message: 'Only event owner can delete this event.' });
    }

    const seriesRootId = existing.series_id || existing.recurrence_parent_id || existing.id;
    const isRecurringSeries = existing.recurrence_rule !== 'none' || !!existing.recurrence_parent_id;
    const shouldDeleteSeries = scope === 'series' && isRecurringSeries;

    const result = await query<{ id: string }>(
      `DELETE FROM events
       WHERE (
         ($3::boolean = false AND id = $1)
         OR
         ($3::boolean = true AND (series_id = $5 OR recurrence_parent_id = $5 OR id = $5))
       )
       AND (
         (user_id = $2)
         OR
         (workspace_id = $4 AND (user_id = $2 OR EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = $4 AND user_id = $2 AND role = 'owner')))
       )
       RETURNING id`,
      [id, req.userId, shouldDeleteSeries, existing.workspace_id, seriesRootId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    return res.status(200).json({ message: 'Event deleted.', deleted_ids: result.rows.map((row) => row.id), deleted_count: result.rows.length });
  } catch (err) {
    console.error('deleteEvent error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getEventParticipants = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;

  try {
    const event = await loadEventAccess(id, req.userId);
    if (!event || !event.workspace_id) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    const hasAccess = event.workspace_role === 'owner' || event.user_id === req.userId || await ensureWorkspaceAccess(event.workspace_id, req.userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Workspace access required.' });
    }

    const result = await query<EventParticipantRow>(
      `SELECT wm.user_id,
              u.name,
              u.email,
              wm.role,
              COALESCE(ep.status, 'pending') AS status,
              ep.decline_reason,
              ep.responded_at,
              (e.user_id = wm.user_id) AS is_creator
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       INNER JOIN events e ON e.id = $1
       LEFT JOIN event_participants ep
         ON ep.event_id = e.id
        AND ep.user_id = wm.user_id
       WHERE wm.workspace_id = e.workspace_id
       ORDER BY CASE WHEN wm.role = 'owner' THEN 0 ELSE 1 END, u.name ASC`,
      [id]
    );

    return res.status(200).json({ participants: result.rows });
  } catch (err) {
    console.error('getEventParticipants error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const updateEventParticipation = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const { id } = req.params;
  const status = req.body?.status === 'accepted' || req.body?.status === 'declined' ? req.body.status : null;

  if (!status) {
    return res.status(400).json({ message: 'status must be accepted or declined.' });
  }

  try {
    const event = await loadEventAccess(id, req.userId);
    if (!event || !event.workspace_id) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    const hasAccess = event.workspace_role === 'owner' || event.user_id === req.userId || await ensureWorkspaceAccess(event.workspace_id, req.userId);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Workspace access required.' });
    }

    const updated = await query<EventParticipantRow>(
      `INSERT INTO event_participants (event_id, user_id, status, decline_reason, responded_at)
       VALUES ($1, $2, $3, NULL, NOW())
       ON CONFLICT (event_id, user_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         decline_reason = NULL,
         responded_at = NOW()
       RETURNING user_id,
                 ''::text AS name,
                 ''::text AS email,
                 'member'::text AS role,
                 status,
                 decline_reason,
                 responded_at,
                 FALSE AS is_creator`,
      [id, req.userId, status]
    );

    return res.status(200).json({ participant: updated.rows[0] });
  } catch (err) {
    console.error('updateEventParticipation error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
