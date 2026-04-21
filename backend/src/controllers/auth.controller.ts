import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../lib/db';
import { sendVerificationCodeEmail } from '../lib/email';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const MAX_AVATAR_DATA_URL_LENGTH = 2_800_000;
const AVATAR_DATA_URL_REGEX = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$/;
const VERIFICATION_EXPIRY_MINUTES = 3;
const VERIFICATION_EXPIRY_MS = VERIFICATION_EXPIRY_MINUTES * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 30;
const DEFAULT_EVENT_CATEGORIES = [
  { type: 'important', label: 'Important', color: '#ef4444' },
  { type: 'work', label: 'Work', color: '#f97316' },
  { type: 'personal', label: 'Personal', color: '#3b82f6' },
  { type: 'team', label: 'Team', color: '#8b5cf6' },
  { type: 'interests', label: 'Interests', color: '#22c55e' },
];

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const generateVerificationCode = () => String(Math.floor(100000 + Math.random() * 900000));

const hashVerificationCode = (code: string) =>
  crypto.createHash('sha256').update(code).digest('hex');

const sendVerificationCode = async (email: string, code: string) => {
  const emailResult = await sendVerificationCodeEmail({
    to: email,
    code,
    expiresInMinutes: VERIFICATION_EXPIRY_MINUTES,
  });

  if (!emailResult.sent) {
    throw new Error(emailResult.reason || 'Could not send verification email.');
  }
};

interface UserEventCategory {
  type: string;
  label: string;
  color: string;
}

const normalizeCategoryType = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const sanitizeHexColor = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : '';
};

const sanitizeUserEventCategories = (value: unknown): UserEventCategory[] => {
  if (!Array.isArray(value)) return DEFAULT_EVENT_CATEGORIES;

  const seen = new Set<string>();
  const categories: UserEventCategory[] = [];

  for (const item of value) {
    const type = normalizeCategoryType((item as { type?: unknown })?.type);
    const label = typeof (item as { label?: unknown })?.label === 'string'
      ? (item as { label: string }).label.trim()
      : '';
    const color = sanitizeHexColor((item as { color?: unknown })?.color);

    if (!type || !label || !color || seen.has(type)) continue;
    seen.add(type);
    categories.push({ type, label, color });
  }

  return categories.length > 0 ? categories : DEFAULT_EVENT_CATEGORIES;
};

// ─── REGISTER ───────────────────────────────────────────
export const register = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    // Check if email already exists
    const existing = await query<{ id: string; email_verified_at: string | null }>(
      'SELECT id, email_verified_at FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];
      if (!existingUser.email_verified_at) {
        return res.status(409).json({
          message: 'This email is registered but not verified yet. Please verify your email code or resend one.',
          requiresVerification: true,
          email: normalizedEmail,
        });
      }
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);
    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

    // Insert user as unverified and save verification challenge.
    await query(
      `INSERT INTO users (
         name,
         email,
         password_hash,
         email_verified_at,
         verification_code_hash,
         verification_code_expires_at,
         verification_code_attempts,
         verification_last_sent_at
       )
       VALUES ($1, $2, $3, NULL, $4, $5, 0, NOW())`,
      [name.trim(), normalizedEmail, password_hash, codeHash, expiresAt]
    );

    await sendVerificationCode(normalizedEmail, code);

    return res.status(201).json({
      message: 'Account created. Enter the 6-digit code sent to your email to verify your account.',
      requiresVerification: true,
      email: normalizedEmail,
      expiresInSeconds: VERIFICATION_EXPIRY_MINUTES * 60,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── VERIFY EMAIL (CODE) ───────────────────────────────
export const verifyEmailCode = async (req: Request, res: Response) => {
  const { email, code } = req.body as { email?: string; code?: string };

  if (!email || !code) {
    return res.status(400).json({ message: 'Email and verification code are required.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const trimmedCode = String(code).trim();

  if (!/^\d{6}$/.test(trimmedCode)) {
    return res.status(400).json({ message: 'Verification code must be 6 digits.' });
  }

  try {
    const result = await query<{
      id: string;
      email_verified_at: string | null;
      verification_code_hash: string | null;
      verification_code_expires_at: string | null;
      verification_code_attempts: number | null;
    }>(
      `SELECT id,
              email_verified_at,
              verification_code_hash,
              verification_code_expires_at,
              verification_code_attempts
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    const user = result.rows[0];

    if (user.email_verified_at) {
      return res.status(200).json({ message: 'Email is already verified.' });
    }

    if (!user.verification_code_hash || !user.verification_code_expires_at) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    const attempts = user.verification_code_attempts ?? 0;
    if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
      return res.status(429).json({ message: 'Too many attempts. Please resend a new code.' });
    }

    if (new Date(user.verification_code_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Verification code expired. Please resend a new code.' });
    }

    const incomingHash = hashVerificationCode(trimmedCode);
    if (incomingHash !== user.verification_code_hash) {
      await query(
        `UPDATE users
         SET verification_code_attempts = COALESCE(verification_code_attempts, 0) + 1,
             updated_at = NOW()
         WHERE id = $1`,
        [user.id]
      );

      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    await query(
      `UPDATE users
       SET email_verified_at = NOW(),
           verification_code_hash = NULL,
           verification_code_expires_at = NULL,
           verification_code_attempts = 0,
           verification_last_sent_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    return res.status(200).json({ message: 'Email verified successfully.' });
  } catch (err) {
    console.error('VerifyEmailCode error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── RESEND VERIFICATION CODE ──────────────────────────
export const resendVerificationCode = async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const result = await query<{
      id: string;
      email_verified_at: string | null;
      verification_last_sent_at: string | null;
    }>(
      `SELECT id, email_verified_at, verification_last_sent_at
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({ message: 'If this email is registered, a verification code has been sent.' });
    }

    const user = result.rows[0];

    if (user.email_verified_at) {
      return res.status(400).json({ message: 'This email is already verified. Please sign in.' });
    }

    if (user.verification_last_sent_at) {
      const elapsedMs = Date.now() - new Date(user.verification_last_sent_at).getTime();
      const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;
      if (elapsedMs < cooldownMs) {
        const waitSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        return res.status(429).json({ message: `Please wait ${waitSeconds}s before requesting another code.` });
      }
    }

    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

    await query(
      `UPDATE users
       SET verification_code_hash = $1,
           verification_code_expires_at = $2,
           verification_code_attempts = 0,
           verification_last_sent_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [codeHash, expiresAt, user.id]
    );

    await sendVerificationCode(normalizedEmail, code);

    return res.status(200).json({
      message: 'A new verification code has been sent.',
      expiresInSeconds: VERIFICATION_EXPIRY_MINUTES * 60,
    });
  } catch (err) {
    console.error('ResendVerificationCode error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── LOGIN ──────────────────────────────────────────────
export const login = async (req: Request, res: Response) => {
  const jwtSecret = process.env.JWT_SECRET;
  const { email, password } = req.body;

  if (!jwtSecret) {
    return res.status(500).json({ message: 'JWT secret is not configured on the server.' });
  }

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const result = await query<{
      id: string;
      name: string;
      email: string;
      password_hash: string;
      email_verified_at: string | null;
      theme: string;
      avatar_url: string | null;
    }>(
      `SELECT id, name, email, password_hash, email_verified_at, theme, avatar_url
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!user.email_verified_at) {
      return res.status(403).json({
        message: 'Please verify your email before signing in.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const token = jwt.sign({ userId: user.id }, jwtSecret, {
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions);

    const { password_hash: _, ...safeUser } = user;

    return res.status(200).json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── GET ME ─────────────────────────────────────────────
export const getMe = async (req: Request & { userId?: string }, res: Response) => {
  try {
    const result = await query<{ id: string; name: string; email: string; theme: string; avatar_url: string | null; user_event_categories: unknown }>(
      'SELECT id, name, email, theme, avatar_url, user_event_categories FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const user = result.rows[0];
    return res.status(200).json({
      user: {
        ...user,
        user_event_categories: sanitizeUserEventCategories(user.user_event_categories),
      },
    });
  } catch (err) {
    console.error('GetMe error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── UPDATE ME ──────────────────────────────────────────
export const updateMe = async (req: Request & { userId?: string }, res: Response) => {
  const { name, theme, avatar_url, currentPassword, newPassword, user_event_categories } = req.body as {
    name?: string;
    theme?: 'light' | 'dark';
    avatar_url?: string | null;
    currentPassword?: string;
    newPassword?: string;
    user_event_categories?: unknown;
  };
  const hasAvatarField = Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar_url');
  const hasCategoriesField = Object.prototype.hasOwnProperty.call(req.body || {}, 'user_event_categories');

  try {
    if (hasAvatarField && avatar_url !== null) {
      if (typeof avatar_url !== 'string') {
        return res.status(400).json({ message: 'Invalid profile picture format.' });
      }
      if (!AVATAR_DATA_URL_REGEX.test(avatar_url)) {
        return res.status(400).json({ message: 'Profile picture must be JPG, JPEG, PNG, or WEBP.' });
      }
      if (avatar_url.length > MAX_AVATAR_DATA_URL_LENGTH) {
        return res.status(400).json({ message: 'Profile picture is too large. Maximum size is 2MB.' });
      }
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to set a new password.' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: 'New password must be at least 8 characters.' });
      }

      const userWithPassword = await query<{ password_hash: string | null }>(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.userId]
      );

      if (userWithPassword.rows.length === 0) {
        return res.status(404).json({ message: 'User not found.' });
      }

      const passwordHash = userWithPassword.rows[0].password_hash;
      if (!passwordHash) {
        return res.status(400).json({ message: 'Password update is not available for this account.' });
      }

      const isValid = await bcrypt.compare(currentPassword, passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: 'Current password is incorrect.' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.userId]);
    }

    const sanitizedCategories = hasCategoriesField
      ? sanitizeUserEventCategories(user_event_categories)
      : null;

    const result = await query<{ id: string; name: string; email: string; theme: string; avatar_url: string | null; user_event_categories: unknown }>(
      `UPDATE users
       SET name = COALESCE($1, name),
           theme = COALESCE($2, theme),
           avatar_url = CASE WHEN $5::boolean THEN $3 ELSE avatar_url END,
           user_event_categories = CASE WHEN $6::boolean THEN $7::jsonb ELSE user_event_categories END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, email, theme, avatar_url, user_event_categories`,
      [name?.trim() || null, theme || null, avatar_url ?? null, req.userId, hasAvatarField, hasCategoriesField, sanitizedCategories ? JSON.stringify(sanitizedCategories) : null]
    );

    const user = result.rows[0];
    return res.status(200).json({
      user: {
        ...user,
        user_event_categories: sanitizeUserEventCategories(user.user_event_categories),
      },
    });
  } catch (err) {
    console.error('UpdateMe error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// ─── DELETE ME ──────────────────────────────────────────
export const deleteMe = async (req: Request & { userId?: string }, res: Response) => {
  try {
    const result = await query<{ id: string }>(
      `DELETE FROM users
       WHERE id = $1
       RETURNING id`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ message: 'Account deleted.' });
  } catch (err) {
    console.error('DeleteMe error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
