import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../src/lib/db', () => ({
  query: queryMock,
}));

vi.mock('../../src/lib/email', () => ({
  sendWorkspaceInviteEmail: vi.fn(),
}));

vi.mock('../../src/lib/socket', () => ({
  getSocketServer: vi.fn().mockReturnValue(null),
}));

import { createWorkspace, getWorkspaces } from '../../src/controllers/workspace.controller';

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('workspace controller (core entry tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getWorkspaces returns 401 when user is missing', async () => {
    const req = { userId: undefined, query: {} } as any;
    const res = makeRes();

    await getWorkspaces(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('createWorkspace validates required workspace name', async () => {
    const req = { userId: 'u1', body: { name: '   ' } } as any;
    const res = makeRes();

    await createWorkspace(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Workspace name is required.' });
  });

  it('createWorkspace creates workspace and owner membership', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'w1', name: 'Alpha', owner_id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = { userId: 'u1', body: { name: 'Alpha', description: 'Main workspace' } } as any;
    const res = makeRes();

    await createWorkspace(req, res as any);

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][1]).toEqual(['Alpha', 'Main workspace', 'u1']);
    expect(queryMock.mock.calls[1][1]).toEqual(['w1', 'u1']);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ workspace: { id: 'w1', name: 'Alpha', owner_id: 'u1' } });
  });
});
