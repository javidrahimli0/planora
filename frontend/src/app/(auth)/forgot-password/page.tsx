'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((prev) => Math.max(0, prev - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Unable to send reset link.');
        if (typeof data.retryInSeconds === 'number') {
          setResendIn(Math.max(0, Math.ceil(data.retryInSeconds)));
        }
        return;
      }

      setMessage(data.message || 'If this email exists, a reset link has been sent.');
      if (typeof data.retryInSeconds === 'number') {
        setResendIn(Math.max(0, Math.ceil(data.retryInSeconds)));
      } else {
        setResendIn(30);
      }
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Reset your password</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--foreground)]" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all placeholder:text-[var(--muted-foreground)]"
          />
        </div>

        {error && (
          <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        {message && (
          <p className="text-sm text-emerald-700 bg-emerald-500/10 px-3 py-2 rounded-lg">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || resendIn > 0}
          className="mt-1 px-4 py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Sending link...' : resendIn > 0 ? `Send again in ${resendIn}s` : 'Send reset link'}
        </button>
      </form>

      <p className="text-sm text-[var(--muted-foreground)] text-center mt-6">
        Remembered your password?{' '}
        <Link href="/login" className="text-[var(--foreground)] font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
