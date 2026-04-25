import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../src/lib/db', () => ({
  query: queryMock,
}));

import {
  createTask,
  deleteTask,
  getTasks,
  updateTask,
} from '../../src/controllers/task.controller';

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('task controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTasks returns paged tasks with default pagination', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1' }, { id: 't2' }] });

    const req = { userId: 'u1', query: {} } as any;
    const res = makeRes();

    await getTasks(req, res as any);

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][1]).toEqual(['u1']);
    expect(queryMock.mock.calls[1][1]).toEqual(['u1', 20, 0]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        tasks: [{ id: 't1' }, { id: 't2' }],
        pagination: expect.objectContaining({ page: 1, limit: 20, total: 2, total_pages: 1 }),
      })
    );
  });

  it('getTasks applies valid status and priority filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { userId: 'u1', query: { status: 'done', priority: 'high', page: '2', limit: '10' } } as any;
    const res = makeRes();

    await getTasks(req, res as any);

    expect(queryMock.mock.calls[0][1]).toEqual(['u1', 'done', 'high']);
    expect(queryMock.mock.calls[1][1]).toEqual(['u1', 'done', 'high', 10, 10]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getTasks ignores invalid filter values and clamps pagination', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { userId: 'u1', query: { status: 'bad', priority: 'urgent', page: '-2', limit: '1000' } } as any;
    const res = makeRes();

    await getTasks(req, res as any);

    expect(queryMock.mock.calls[0][1]).toEqual(['u1']);
    expect(queryMock.mock.calls[1][1]).toEqual(['u1', 100, 0]);
  });

  it('getTasks falls back to defaults for non-numeric page and limit', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1' }] });

    const req = { userId: 'u1', query: { page: 'abc', limit: 'xyz' } } as any;
    const res = makeRes();

    await getTasks(req, res as any);

    expect(queryMock.mock.calls[1][1]).toEqual(['u1', 20, 0]);
  });

  it('getTasks returns has_next true when there are more rows', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ total: 5 }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1' }, { id: 't2' }] });

    const req = { userId: 'u1', query: { page: '1', limit: '2' } } as any;
    const res = makeRes();

    await getTasks(req, res as any);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ has_next: true, has_prev: false }),
      })
    );
  });

  it('getTasks returns 500 on db failure', async () => {
    queryMock.mockRejectedValueOnce(new Error('db fail'));

    const req = { userId: 'u1', query: {} } as any;
    const res = makeRes();

    await getTasks(req, res as any);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error.' });
  });

  it('createTask returns 400 when title is missing', async () => {
    const req = { userId: 'u1', body: { title: '   ' } } as any;
    const res = makeRes();

    await createTask(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('createTask returns 400 for invalid priority', async () => {
    const req = { userId: 'u1', body: { title: 'A', priority: 'urgent' } } as any;
    const res = makeRes();

    await createTask(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid priority value.' });
  });

  it('createTask returns 400 for invalid status', async () => {
    const req = { userId: 'u1', body: { title: 'A', status: 'archived' } } as any;
    const res = makeRes();

    await createTask(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid status value.' });
  });

  it('createTask inserts task and returns 201', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 't1', title: 'Do work' }] });

    const req = {
      userId: 'u1',
      body: { title: '  Do work  ', description: 'desc', priority: 'high', status: 'pending' },
    } as any;
    const res = makeRes();

    await createTask(req, res as any);

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][1]).toEqual(['u1', null, null, 'Do work', 'desc', null, 'high', 'pending']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ task: { id: 't1', title: 'Do work' } });
  });

  it('createTask uses defaults when optional fields are omitted', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 't-default', title: 'Task' }] });

    const req = {
      userId: 'u1',
      body: { title: 'Task' },
    } as any;
    const res = makeRes();

    await createTask(req, res as any);

    expect(queryMock.mock.calls[0][1]).toEqual(['u1', null, null, 'Task', null, null, 'medium', 'pending']);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createTask returns 500 on db failure', async () => {
    queryMock.mockRejectedValueOnce(new Error('db fail'));

    const req = { userId: 'u1', body: { title: 'Task' } } as any;
    const res = makeRes();

    await createTask(req, res as any);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error.' });
  });

  it('updateTask validates priority', async () => {
    const req = { userId: 'u1', params: { id: 't1' }, body: { priority: 'urgent' } } as any;
    const res = makeRes();

    await updateTask(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('updateTask validates status', async () => {
    const req = { userId: 'u1', params: { id: 't1' }, body: { status: 'archived' } } as any;
    const res = makeRes();

    await updateTask(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('updateTask validates empty title', async () => {
    const req = { userId: 'u1', params: { id: 't1' }, body: { title: '   ' } } as any;
    const res = makeRes();

    await updateTask(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Title cannot be empty.' });
  });

  it('updateTask returns 404 when task does not exist', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const req = { userId: 'u1', params: { id: 'missing' }, body: { status: 'done' } } as any;
    const res = makeRes();

    await updateTask(req, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task not found.' });
  });

  it('updateTask returns updated task', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 't1', status: 'done' }] });

    const req = { userId: 'u1', params: { id: 't1' }, body: { title: '  Done  ', status: 'done' } } as any;
    const res = makeRes();

    await updateTask(req, res as any);

    expect(queryMock.mock.calls[0][1][0]).toBe('Done');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ task: { id: 't1', status: 'done' } });
  });

  it('updateTask returns 500 on db error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db fail'));

    const req = { userId: 'u1', params: { id: 't1' }, body: { status: 'done' } } as any;
    const res = makeRes();

    await updateTask(req, res as any);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error.' });
  });

  it('deleteTask returns 404 when task is not found', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const req = { userId: 'u1', params: { id: 'missing' } } as any;
    const res = makeRes();

    await deleteTask(req, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task not found.' });
  });

  it('deleteTask deletes task and returns success', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 't1' }] });

    const req = { userId: 'u1', params: { id: 't1' } } as any;
    const res = makeRes();

    await deleteTask(req, res as any);

    expect(queryMock.mock.calls[0][1]).toEqual(['t1', 'u1']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Task deleted.' });
  });

  it('deleteTask returns 500 on db error', async () => {
    queryMock.mockRejectedValueOnce(new Error('db fail'));

    const req = { userId: 'u1', params: { id: 't1' } } as any;
    const res = makeRes();

    await deleteTask(req, res as any);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error.' });
  });
});
