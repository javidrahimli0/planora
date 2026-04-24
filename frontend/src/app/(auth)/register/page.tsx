'use client';

import { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function RegisterPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const [info, setInfo] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((prev) => Math.max(0, prev - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      router.push('/workspace');
    }
  }, [status, session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!isVerificationStep && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (isVerificationStep) {
      await handleVerifyCode();
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requiresVerification && data.email) {
          setPendingEmail(data.email);
          setIsVerificationStep(true);
          setResendIn(30);
          setInfo('Your verification code is active for 3 minutes. Enter it below or resend if it expires.');
          setLoading(false);
          return;
        }
        setError(data.message || 'Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      const verificationEmail = data.email || email.trim().toLowerCase();
      setPendingEmail(verificationEmail);
      setIsVerificationStep(true);
      setResendIn(30);
      setInfo(data.message || 'Account created. Enter the verification code sent to your email.');
    } catch {
      setError('Something went wrong. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const normalizedCode = code.replace(/\D/g, '').slice(0, 6);
    if (normalizedCode.length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      const verifyRes = await fetch(`${API_URL}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail, code: normalizedCode }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        setError(verifyData.message || 'Verification failed.');
        return;
      }

      const signInResult = await signIn('credentials', {
        email: pendingEmail,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        setInfo('Email verified successfully. Please sign in.');
        router.push('/login');
        return;
      }

      router.push('/workspace');
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendIn > 0) return;

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pendingEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Unable to resend verification code.');
        return;
      }

      setResendIn(30);
      setInfo(data.message || 'A new verification code has been sent.');
    } catch {
      setError('Unable to resend verification code right now.');
    } finally {
      setLoading(false);
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
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          {isVerificationStep ? 'Verify your email' : 'Create your account'}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          {isVerificationStep
            ? `Enter the 6-digit code sent to ${pendingEmail}`
            : 'Start organizing your work with Planora'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!isVerificationStep ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--foreground)]" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                required
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all placeholder:text-[var(--muted-foreground)]"
              />
            </div>

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
                  placeholder="Min. 8 characters"
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
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--foreground)]" htmlFor="code">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              pattern="[0-9]{6}"
              required
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm tracking-[0.22em] font-semibold outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all placeholder:text-[var(--muted-foreground)]"
            />
            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
              <span>Code expires in 3 minutes.</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading || resendIn > 0}
                className="font-medium text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}

        {info && (
          <p className="text-sm text-[var(--foreground)] bg-[var(--muted)] px-3 py-2 rounded-lg">
            {info}
          </p>
        )}

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
          {loading
            ? isVerificationStep ? 'Verifying...' : 'Creating account...'
            : isVerificationStep ? 'Verify and continue' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-[var(--muted-foreground)] text-center mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-[var(--foreground)] font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
