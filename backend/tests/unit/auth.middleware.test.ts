import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../src/middleware/auth.middleware';

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

type MockReq = {
  headers: { authorization?: string };
  userId?: string;
};

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe('authenticate middleware', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  it('returns 500 when JWT secret is missing', () => {
    process.env.JWT_SECRET = '';
    const req: MockReq = { headers: {} };
    const res = makeRes();
    const next = vi.fn();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'JWT secret is not configured on the server.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is missing', () => {
    const req: MockReq = { headers: {} };
    const res = makeRes();
    const next = vi.fn();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', () => {
    const verify = vi.mocked(jwt.verify);
    verify.mockImplementation(() => {
      throw new Error('invalid');
    });

    const req: MockReq = { headers: { authorization: 'Bearer bad-token' } };
    const res = makeRes();
    const next = vi.fn();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token. Please sign in again.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets userId and calls next for valid token', () => {
    const verify = vi.mocked(jwt.verify);
    verify.mockReturnValue({ userId: 'user-123' } as any);

    const req: MockReq = { headers: { authorization: 'Bearer good-token' } };
    const res = makeRes();
    const next = vi.fn();

    authenticate(req as any, res as any, next);

    expect(req.userId).toBe('user-123');
    expect(verify).toHaveBeenCalledWith('good-token', 'test-secret');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('handles malformed authorization header', () => {
    const req: MockReq = { headers: { authorization: 'MalformedToken' } };
    const res = makeRes();
    const next = vi.fn();

    authenticate(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts lowercase bearer prefix because token extraction splits on space', () => {
    const verify = vi.mocked(jwt.verify);
    verify.mockReturnValue({ userId: 'user-lowercase' } as any);

    const req: MockReq = { headers: { authorization: 'bearer token' } };
    const res = makeRes();
    const next = vi.fn();

    authenticate(req as any, res as any, next);

    expect(verify).toHaveBeenCalledWith('token', 'test-secret');
    expect(req.userId).toBe('user-lowercase');
    expect(next).toHaveBeenCalledOnce();
  });

});
