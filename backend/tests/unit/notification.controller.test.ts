import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, getSocketServerMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  getSocketServerMock: vi.fn(),
}));

vi.mock('../../src/lib/db', () => ({
  query: queryMock,
}));

vi.mock('../../src/lib/socket', () => ({
  getSocketServer: getSocketServerMock,
}));

import {
  getNotifications,
  updateNotificationPreference,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../src/controllers/notification.controller';

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('notification controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSocketServerMock.mockReturnValue(null);
  });

  it('getNotifications returns 401 when user is missing', async () => {
    const req = { userId: undefined, query: {} } as any;
    const res = makeRes();

    await getNotifications(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('getNotifications clamps limit and returns list', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'n1' }] });

    const req = { userId: 'u1', query: { limit: '500' } } as any;
    const res = makeRes();

    await getNotifications(req, res as any);

    expect(queryMock.mock.calls[0][1]).toEqual(['u1', 100]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ notifications: [{ id: 'n1' }] });
  });

  it('updateNotificationPreference validates required fields', async () => {
    const req = { userId: 'u1', body: { type: 'global_all' } } as any;
    const res = makeRes();

    await updateNotificationPreference(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('updateNotificationPreference rejects unsupported type', async () => {
    const req = { userId: 'u1', body: { type: 'something_else', is_muted: true } } as any;
    const res = makeRes();

    await updateNotificationPreference(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unsupported notification type.' });
  });

  it('getUnreadCount returns zero when query has no rows', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const req = { userId: 'u1' } as any;
    const res = makeRes();

    await getUnreadCount(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ unread_count: 0 });
  });

  it('markNotificationRead emits socket event when notification exists', async () => {
    const toMock = vi.fn().mockReturnValue({ emit: vi.fn() });
    getSocketServerMock.mockReturnValue({ to: toMock });
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'n1', user_id: 'u1', is_read: true }] });

    const req = { userId: 'u1', params: { id: 'n1' } } as any;
    const res = makeRes();

    await markNotificationRead(req, res as any);

    expect(toMock).toHaveBeenCalledWith('user:u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ notification: { id: 'n1', user_id: 'u1', is_read: true } });
  });

  it('markAllNotificationsRead emits read_all event', async () => {
    const emitMock = vi.fn();
    const toMock = vi.fn().mockReturnValue({ emit: emitMock });
    getSocketServerMock.mockReturnValue({ to: toMock });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const req = { userId: 'u1' } as any;
    const res = makeRes();

    await markAllNotificationsRead(req, res as any);

    expect(toMock).toHaveBeenCalledWith('user:u1');
    expect(emitMock).toHaveBeenCalledWith('notification:read_all', { user_id: 'u1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
