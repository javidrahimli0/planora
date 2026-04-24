'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/runtime';

const API_URL = getApiBaseUrl();

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      router.push('/workspace');
    }
  }, [status, session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const precheck = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!precheck.ok) {
        const payload = await precheck.json();
        setError(payload.message || 'Invalid email or password. Please try again.');
        setLoading(false);
        return;
      }
    } catch {
      setError('Unable to connect to server. Please try again.');
      setLoading(false);
      return;
    }

    const result = await signIn('credentials', {
      email: email.trim(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password. Please try again.');
    } else {
      router.push('/workspace');
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (status === 'authenticated') {
    return null;
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Welcome back</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Sign in to your Planora account
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

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-[var(--foreground)]" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 pr-10 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all placeholder:text-[var(--muted-foreground)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 px-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 px-4 py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-sm text-[var(--muted-foreground)] text-center mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-[var(--foreground)] font-medium hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
