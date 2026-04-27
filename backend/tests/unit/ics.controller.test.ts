import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
}));

vi.mock('../../src/lib/db', () => ({
  query: queryMock,
}));

import { exportICS, importICS } from '../../src/controllers/ics.controller';

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    send: vi.fn().mockReturnThis(),
  };
}

describe('ics controller contract behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('importICS returns 400 when no file is uploaded', async () => {
    const req = { file: undefined } as any;
    const res = makeRes();

    await importICS(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'No .ics file uploaded.' });
  });

  it('importICS returns 400 when file has no events', async () => {
    const req = {
      userId: 'u1',
      file: { buffer: Buffer.from('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR') },
    } as any;
    const res = makeRes();

    await importICS(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'No events found in the .ics file.' });
  });

  it('exportICS returns 401 when user is missing', async () => {
    const req = { userId: undefined } as any;
    const res = makeRes();

    await exportICS(req, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized.' });
  });

  it('exportICS returns calendar file for authenticated user', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'e1',
          title: 'Standup',
          description: 'Daily sync',
          start_time: '2026-04-28T08:00:00.000Z',
          end_time: '2026-04-28T08:30:00.000Z',
          is_all_day: false,
          location: 'Room 1',
          ics_uid: null,
          updated_at: '2026-04-27T10:00:00.000Z',
        },
      ],
    });

    const req = { userId: 'u1' } as any;
    const res = makeRes();

    await exportICS(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/calendar; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('BEGIN:VCALENDAR'));
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('SUMMARY:Standup'));
  });
});
