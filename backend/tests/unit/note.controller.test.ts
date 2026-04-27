import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../src/lib/db', () => ({
  query: queryMock,
}));

vi.mock('../../src/lib/socket', () => ({
  getSocketServer: vi.fn().mockReturnValue(null),
}));

import { createNote, deleteNote, getNotes, updateNote } from '../../src/controllers/note.controller';

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('note controller contract behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getNotes returns 401 for unauthenticated user', async () => {
    const req = { userId: undefined, query: {} } as any;
    const res = makeRes();

    await getNotes(req, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized.' });
  });

  it('createNote returns 403 when user cannot use workspace', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const req = {
      userId: 'u1',
      body: { title: 'N', content: 'Body', workspace_id: 'w1' },
    } as any;
    const res = makeRes();

    await createNote(req, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'You are not a member of this collaboration group.' });
  });

  it('createNote returns 201 with note payload for valid request', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'n1',
            user_id: 'u1',
            workspace_id: 'w1',
            title: 'Note',
            content: 'Body',
            note_group: 'General',
            is_pinned: false,
            created_at: '2026-04-27T10:00:00.000Z',
            updated_at: '2026-04-27T10:00:00.000Z',
            access_permission: 'owner',
            access_scope: 'mine',
            shares_count: 0,
            shared_workspaces: [],
          },
        ],
      });

    const req = {
      userId: 'u1',
      body: { title: 'Note', content: 'Body', workspace_id: 'w1' },
    } as any;
    const res = makeRes();

    await createNote(req, res as any);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ note: expect.objectContaining({ id: 'n1', title: 'Note' }) })
    );
  });

  it('updateNote returns 400 when body has nothing to update', async () => {
    const req = { userId: 'u1', params: { id: 'n1' }, body: {} } as any;
    const res = makeRes();

    await updateNote(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Nothing to update.' });
  });

  it('deleteNote returns 403 for non-owner shared note', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'n1',
          user_id: 'owner1',
          workspace_id: 'w1',
          title: 'Shared',
          content: 'Body',
          note_group: 'General',
          is_pinned: false,
          created_at: '2026-04-27T10:00:00.000Z',
          updated_at: '2026-04-27T10:00:00.000Z',
          access_permission: 'viewer',
          access_scope: 'shared_with_me',
          shares_count: 1,
          shared_workspaces: ['Workspace'],
        },
      ],
    });

    const req = { userId: 'u1', params: { id: 'n1' } } as any;
    const res = makeRes();

    await deleteNote(req, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Only note owner can delete this note.' });
  });
});
