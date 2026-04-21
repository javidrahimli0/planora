import { Response } from 'express';
import { query } from '../lib/db';
import { AuthRequest } from '../middleware/auth.middleware';
import { getSocketServer } from '../lib/socket';

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

interface NotificationPreferenceRow {
  user_id: string;
  type: string;
  is_muted: boolean;
  updated_at: string;
}

const ALLOWED_NOTIFICATION_TYPES = [
  'global_all',
  'workspace_invite_received',
  'workspace_invite_response',
  'workspace_member_joined',
] as const;

export const getNotifications = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const limitRaw = Number(req.query.limit || 25);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 25;

  try {
    const result = await query<NotificationRow>(
      `SELECT id, user_id, type, title, message, metadata, is_read, created_at, read_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.userId, limit]
    );

    return res.status(200).json({ notifications: result.rows });
  } catch (err) {
    console.error('getNotifications error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getNotificationPreferences = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const result = await query<NotificationPreferenceRow>(
      `SELECT user_id, type, is_muted, updated_at
       FROM notification_preferences
       WHERE user_id = $1`,
      [req.userId]
    );

    return res.status(200).json({ preferences: result.rows });
  } catch (err) {
    console.error('getNotificationPreferences error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const updateNotificationPreference = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  const type = typeof req.body?.type === 'string' ? req.body.type.trim() : '';
  const isMuted = typeof req.body?.is_muted === 'boolean' ? req.body.is_muted : null;

  if (!type || isMuted === null) {
    return res.status(400).json({ message: 'type and is_muted are required.' });
  }

  if (!ALLOWED_NOTIFICATION_TYPES.includes(type as (typeof ALLOWED_NOTIFICATION_TYPES)[number])) {
    return res.status(400).json({ message: 'Unsupported notification type.' });
  }

  try {
    const updated = await query<NotificationPreferenceRow>(
      `INSERT INTO notification_preferences (user_id, type, is_muted)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, type)
       DO UPDATE SET is_muted = EXCLUDED.is_muted, updated_at = NOW()
       RETURNING user_id, type, is_muted, updated_at`,
      [req.userId, type, isMuted]
    );

    return res.status(200).json({ preference: updated.rows[0] });
  } catch (err) {
    console.error('updateNotificationPreference error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    const result = await query<{ unread_count: number }>(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE user_id = $1
         AND is_read = FALSE`,
      [req.userId]
    );

    return res.status(200).json({ unread_count: result.rows[0]?.unread_count ?? 0 });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });
  const { id } = req.params;

  try {
    const updated = await query<NotificationRow>(
      `UPDATE notifications
       SET is_read = TRUE,
           read_at = NOW()
       WHERE id = $1
         AND user_id = $2
       RETURNING id, user_id, type, title, message, metadata, is_read, created_at, read_at`,
      [id, req.userId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    const socketServer = getSocketServer();
    if (socketServer) {
      socketServer.to(`user:${req.userId}`).emit('notification:read', {
        id,
      });
    }

    return res.status(200).json({ notification: updated.rows[0] });
  } catch (err) {
    console.error('markNotificationRead error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const markAllNotificationsRead = async (req: AuthRequest, res: Response) => {
  if (!req.userId) return res.status(401).json({ message: 'Unauthorized.' });

  try {
    await query(
      `UPDATE notifications
       SET is_read = TRUE,
           read_at = NOW()
       WHERE user_id = $1
         AND is_read = FALSE`,
      [req.userId]
    );

    const socketServer = getSocketServer();
    if (socketServer) {
      socketServer.to(`user:${req.userId}`).emit('notification:read_all', {
        user_id: req.userId,
      });
    }

    return res.status(200).json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('markAllNotificationsRead error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
