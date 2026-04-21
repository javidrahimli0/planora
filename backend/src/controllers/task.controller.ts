import { Response } from 'express';
import { query } from '../lib/db';
import { AuthRequest } from '../middleware/auth.middleware';

type TaskStatus = 'pending' | 'in_progress' | 'done';
type TaskPriority = 'low' | 'medium' | 'high';

interface TaskRow {
  id: string;
  user_id: string;
  workspace_id: string | null;
  event_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

const VALID_STATUS: TaskStatus[] = ['pending', 'in_progress', 'done'];
const VALID_PRIORITY: TaskPriority[] = ['low', 'medium', 'high'];

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

export const getTasks = async (req: AuthRequest, res: Response) => {
  const status = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const pagination = parsePaginationParams(req.query.page, req.query.limit, { limit: 20, maxLimit: 100 });

  const params: string[] = [req.userId as string];
  const where: string[] = ['user_id = $1'];

  if (status && VALID_STATUS.includes(status as TaskStatus)) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }

  if (priority && VALID_PRIORITY.includes(priority as TaskPriority)) {
    params.push(priority);
    where.push(`priority = $${params.length}`);
  }

  try {
    const totalResult = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM tasks
       WHERE ${where.join(' AND ')}`,
      params
    );

    const listParams = [...params, pagination.limit, pagination.offset];
    const result = await query<TaskRow>(
      `SELECT * FROM tasks
       WHERE ${where.join(' AND ')}
       ORDER BY due_date ASC NULLS LAST, created_at DESC
       LIMIT $${listParams.length - 1}
       OFFSET $${listParams.length}`,
      listParams
    );

    const total = totalResult.rows[0]?.total || 0;
    return res.status(200).json({
      tasks: result.rows,
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
    console.error('getTasks error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const createTask = async (req: AuthRequest, res: Response) => {
  const {
    title,
    description,
    due_date,
    priority = 'medium',
    status = 'pending',
    event_id,
    workspace_id,
  } = req.body as {
    title?: string;
    description?: string | null;
    due_date?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
    event_id?: string | null;
    workspace_id?: string | null;
  };

  if (!title?.trim()) {
    return res.status(400).json({ message: 'Title is required.' });
  }

  if (!VALID_PRIORITY.includes(priority)) {
    return res.status(400).json({ message: 'Invalid priority value.' });
  }

  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  try {
    const result = await query<TaskRow>(
      `INSERT INTO tasks
         (user_id, workspace_id, event_id, title, description, due_date, priority, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.userId,
        workspace_id || null,
        event_id || null,
        title.trim(),
        description || null,
        due_date || null,
        priority,
        status,
      ]
    );

    return res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    console.error('createTask error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const {
    title,
    description,
    due_date,
    priority,
    status,
    event_id,
    workspace_id,
  } = req.body as {
    title?: string;
    description?: string | null;
    due_date?: string | null;
    priority?: TaskPriority;
    status?: TaskStatus;
    event_id?: string | null;
    workspace_id?: string | null;
  };

  if (priority && !VALID_PRIORITY.includes(priority)) {
    return res.status(400).json({ message: 'Invalid priority value.' });
  }

  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ message: 'Title cannot be empty.' });
  }

  try {
    const result = await query<TaskRow>(
      `UPDATE tasks
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           due_date = COALESCE($3, due_date),
           priority = COALESCE($4, priority),
           status = COALESCE($5, status),
           event_id = COALESCE($6, event_id),
           workspace_id = COALESCE($7, workspace_id),
           updated_at = NOW()
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [
        title?.trim() ?? null,
        description ?? null,
        due_date ?? null,
        priority ?? null,
        status ?? null,
        event_id ?? null,
        workspace_id ?? null,
        id,
        req.userId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    return res.status(200).json({ task: result.rows[0] });
  } catch (err) {
    console.error('updateTask error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  try {
    const result = await query<TaskRow>(
      `DELETE FROM tasks
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    return res.status(200).json({ message: 'Task deleted.' });
  } catch (err) {
    console.error('deleteTask error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
