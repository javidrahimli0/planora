import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, sendPasswordResetEmailMock, bcryptHashMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn(),
  bcryptHashMock: vi.fn(),
}));

vi.mock('../../src/lib/db', () => ({
  query: queryMock,
}));

vi.mock('../../src/lib/email', () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  sendVerificationCodeEmail: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: bcryptHashMock,
    compare: vi.fn(),
  },
}));

import { requestPasswordReset, resetPassword } from '../../src/controllers/auth.controller';

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('auth controller password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = 'http://localhost:3000';
    sendPasswordResetEmailMock.mockResolvedValue({ sent: true });
    bcryptHashMock.mockResolvedValue('hashed-password');
  });

  it('requestPasswordReset returns 400 when email is missing', async () => {
    const req = { body: {} } as any;
    const res = makeRes();

    await requestPasswordReset(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Email is required.' });
  });

  it('requestPasswordReset returns generic success when email is unknown', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const req = { body: { email: 'missing@example.com' } } as any;
    const res = makeRes();

    await requestPasswordReset(req, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'If this email exists, a password reset link has been sent.',
      retryInSeconds: 30,
    });
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it('requestPasswordReset returns 429 while cooldown is active', async () => {
    const recentDate = new Date(Date.now() - 5_000).toISOString();
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', email_verified_at: new Date().toISOString(), password_reset_last_sent_at: recentDate }],
    });

    const req = { body: { email: 'user@example.com' } } as any;
    const res = makeRes();

    await requestPasswordReset(req, res as any);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ retryInSeconds: expect.any(Number) })
    );
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled();
  });

  it('requestPasswordReset saves token and sends reset email', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'u1', email_verified_at: new Date().toISOString(), password_reset_last_sent_at: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const req = { body: { email: 'user@example.com' } } as any;
    const res = makeRes();

    await requestPasswordReset(req, res as any);

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[1][0]).toContain('password_reset_token_hash');
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        resetLink: expect.stringContaining('/reset-password?token='),
        expiresInMinutes: 5,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'If this email exists, a password reset link has been sent.',
      retryInSeconds: 30,
    });
  });

  it('resetPassword returns 400 for invalid payload', async () => {
    const req = { body: { token: '', password: '' } } as any;
    const res = makeRes();

    await resetPassword(req, res as any);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('resetPassword rejects unknown token', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const req = { body: { token: 'bad-token', password: 'newpassword' } } as any;
    const res = makeRes();

    await resetPassword(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired reset link.' });
  });

  it('resetPassword rejects expired token', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', password_reset_expires_at: new Date(Date.now() - 10_000).toISOString() }],
    });

    const req = { body: { token: 'expired-token', password: 'newpassword' } } as any;
    const res = makeRes();

    await resetPassword(req, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired reset link.' });
  });

  it('resetPassword updates password and clears reset token', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ id: 'u1', password_reset_expires_at: new Date(Date.now() + 60_000).toISOString() }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const req = { body: { token: 'valid-token', password: 'newpassword' } } as any;
    const res = makeRes();

    await resetPassword(req, res as any);

    expect(bcryptHashMock).toHaveBeenCalledWith('newpassword', 12);
    expect(queryMock.mock.calls[1][0]).toContain('password_reset_token_hash = NULL');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Password updated successfully.' });
  });
});
