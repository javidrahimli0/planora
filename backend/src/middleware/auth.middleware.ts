import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

// JWT auth middleware — to be fully implemented in Phase 3
export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ message: 'JWT secret is not configured on the server.' });
  }

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token. Please sign in again.' });
  }
};
