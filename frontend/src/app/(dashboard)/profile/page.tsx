'use client';

import { useEffect, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { apiFetch, apiFetchForm } from '@/lib/api';
import { getApiBaseUrl } from '@/lib/runtime';
import {
  EventCategoryOption,
  getDefaultEventCategories,
  normalizeEventType,
  sanitizeCategoryColor,
  saveUserEventCategories,
  sanitizeEventCategories,
} from '@/lib/eventCategories';

type Theme = 'light' | 'dark';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_FILE_BYTES = 2 * 1024 * 1024;
const API_URL = getApiBaseUrl();
const DEFAULT_CATEGORY_COLOR = '#3b82f6';

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const token = session?.user.accessToken || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('light');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventCategories, setEventCategories] = useState<EventCategoryOption[]>(getDefaultEventCategories());
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(DEFAULT_CATEGORY_COLOR);

  useEffect(() => {
    if (!session) return;
    setName(session.user.name || '');
    setEmail(session.user.email || '');
    const stored = localStorage.getItem('planora-theme') as Theme | null;
    setTheme(stored || (session.user.theme as Theme) || 'light');
    setEventCategories(getDefaultEventCategories());
  }, [session]);

  useEffect(() => {
    if (!token) return;

    const loadProfile = async () => {
      try {
        const res = await apiFetch<{ user: { name: string; email: string; theme: Theme; avatar_url: string | null; user_event_categories?: unknown } }>('/api/auth/me', token);
        setName(res.user.name || '');
        setEmail(res.user.email || '');
        setAvatarUrl(res.user.avatar_url || null);
        const categories = sanitizeEventCategories(res.user.user_event_categories);
        setEventCategories(categories);
        saveUserEventCategories(categories);
        const stored = localStorage.getItem('planora-theme') as Theme | null;
        setTheme(stored || res.user.theme || 'light');
      } catch {
        // Keep current UI state when profile fetch fails.
      }
    };

    loadProfile();
  }, [token]);

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'U';

  const applyTheme = (next: Theme) => {
    setTheme(next);
    localStorage.setItem('planora-theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  const addEventCategory = () => {
    const label = newCategoryName.trim();
    if (!label) return;

    const type = normalizeEventType(label);
    const color = sanitizeCategoryColor(newCategoryColor);

    if (eventCategories.some((category) => category.type === type)) {
      setErr('Category name already exists. Use a different name.');
      return;
    }

    const updated = [...eventCategories, { type, label, color }];
    setEventCategories(updated);
    setNewCategoryName('');
    setNewCategoryColor(DEFAULT_CATEGORY_COLOR);
    setErr('');
    setMsg('Category added. Click Save changes to apply.');
  };

  const removeEventCategory = (type: string) => {
    const updated = eventCategories.filter((category) => category.type !== type);
    setEventCategories(updated.length > 0 ? updated : getDefaultEventCategories());
    setErr('');
    setMsg('Category removed. Click Save changes to apply.');
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setSaving(true);

    try {
      await apiFetch<{ user: unknown }>('/api/auth/me', token, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim() || undefined,
          theme,
          avatar_url: avatarUrl,
          user_event_categories: eventCategories,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });

      localStorage.setItem('planora-theme', theme);
      saveUserEventCategories(eventCategories);
      setCurrentPassword('');
      setNewPassword('');
      setMsg('Profile updated.');
      await update();
    } catch (error: any) {
      setErr(error.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const onAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMsg('');
    setErr('');

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setErr('Unsupported file format. Use JPG, JPEG, PNG, or WEBP.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setErr('Image is too large. Maximum allowed size is 2MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const nextAvatar = typeof reader.result === 'string' ? reader.result : null;
      if (!nextAvatar) {
        setErr('Could not process selected image.');
        return;
      }
      setAvatarUrl(nextAvatar);
      setMsg('Profile picture updated locally. Click Save changes to apply.');
      e.target.value = '';
    };
    reader.onerror = () => setErr('Could not read selected image.');
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    setErr('');
    setAvatarUrl(null);
    setMsg('Profile picture removed locally. Click Save changes to apply.');
  };

  const deleteAccount = async () => {
    if (!token || deletingAccount) return;
    setDeletingAccount(true);
    setErr('');

    try {
      await apiFetch<{ message: string }>('/api/auth/me', token, { method: 'DELETE' });
      await signOut({ callbackUrl: '/register' });
    } catch (error: any) {
      setErr(error.message || 'Failed to delete account.');
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const importICS = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setImportLoading(true);
    setMsg('');
    setErr('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetchForm<{ message: string }>('/api/events/import/ics', token, formData);
      setMsg(res.message || 'ICS imported successfully.');
    } catch (error: any) {
      setErr(error.message || 'Failed to import .ics file.');
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  const exportICS = async () => {
    if (!token || exportLoading) return;

    setExportLoading(true);
    setMsg('');
    setErr('');
    try {
      const res = await fetch(`${API_URL}/api/events/export/ics`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        let message = 'Failed to export .ics file.';
        try {
          const data = await res.json();
          message = data?.message || message;
        } catch {
          // Keep fallback error message.
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fallbackName = `planora-events-${new Date().toISOString().slice(0, 10)}.ics`;
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      link.href = url;
      link.download = match?.[1] || fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMsg('ICS exported successfully.');
    } catch (error: any) {
      setErr(error.message || 'Failed to export .ics file.');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Profile settings</h1>

      <form onSubmit={saveProfile} className="flex flex-col gap-5">
        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)] space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="h-20 w-20 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--muted)] flex items-center justify-center text-lg font-semibold text-[var(--foreground)]">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="h-10 w-[132px] px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm inline-flex items-center justify-center cursor-pointer hover:bg-[var(--muted)]">
                  Upload image
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="hidden" onChange={onAvatarUpload} />
                </label>
                <p className="text-xs text-[var(--muted-foreground)]">Allowed: JPG, JPEG, PNG, WEBP (max 2MB)</p>
              </div>
              <button
                type="button"
                onClick={removeAvatar}
                className="h-10 w-[132px] px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm inline-flex items-center justify-center"
              >
                Remove photo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Display name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                value={email}
                disabled
                className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm text-[var(--muted-foreground)]"
              />
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium">Theme preference</label>
            <select
              value={theme}
              onChange={(e) => applyTheme(e.target.value as Theme)}
              className="w-[110px] px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '20px',
                paddingRight: '32px',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
              }}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)] space-y-4">
          <p className="text-sm font-medium">Event categories</p>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_42px_auto] gap-2 items-center">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                className="h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
              />
              <div className="h-10 w-[42px] rounded-xl border border-[var(--border)] bg-[var(--background)] flex items-center justify-center overflow-hidden">
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-full border-none bg-transparent p-0"
                  aria-label="Choose category color"
                />
              </div>
              <button
                type="button"
                onClick={addEventCategory}
                className="h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm hover:bg-[var(--muted)]"
              >
                Add
              </button>
            </div>

            <div className="h-px bg-[var(--border)]/80" />

            <div className="flex flex-wrap gap-2">
              {eventCategories.map((category) => (
                <span
                  key={category.type}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
                >
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: category.color }} />
                  <span>{category.label}</span>
                  <button
                    type="button"
                    onClick={() => removeEventCategory(category.type)}
                    className="ml-1 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
                    aria-label={`Remove ${category.label}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)] space-y-4">
          <div>
            <label className="text-sm font-medium">Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-medium">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
            />
          </div>

          <p className="text-xs text-[var(--muted-foreground)]">Use at least 8 characters for stronger account security.</p>
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)] space-y-4">
          <h2 className="text-sm font-medium">Import &amp; Export</h2>
          <p className="text-xs text-[var(--muted-foreground)]">Import events from a .ics file or export your current events to .ics.</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`h-10 px-4 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm inline-flex items-center justify-center cursor-pointer ${importLoading ? 'opacity-60 pointer-events-none' : 'hover:bg-[var(--muted)]'}`}>
              {importLoading ? 'Importing...' : 'Import .ics'}
              <input type="file" accept=".ics" className="hidden" onChange={importICS} />
            </label>
            <button
              type="button"
              onClick={exportICS}
              disabled={exportLoading}
              className="h-10 px-4 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm hover:bg-[var(--muted)] disabled:opacity-60"
            >
              {exportLoading ? 'Exporting...' : 'Export .ics'}
            </button>
          </div>
        </section>

        <section className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)] space-y-4">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="h-10 px-4 rounded-xl bg-[var(--destructive)] text-white text-sm font-medium"
          >
            Delete account
          </button>
        </section>

        <div className="space-y-2">
          {msg && <p className="text-sm text-[var(--primary)]">{msg}</p>}
          {err && <p className="text-sm text-[var(--destructive)]">{err}</p>}
          <div className="flex justify-end">
            <button disabled={saving} className="px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <h3 className="text-lg font-semibold">Are you sure?</h3>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">This action is permanent and cannot be undone.</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingAccount}
                className="h-10 px-3 rounded-xl border border-[var(--border)] text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deletingAccount}
                className="h-10 px-3 rounded-xl bg-[var(--destructive)] text-white text-sm font-medium disabled:opacity-60"
              >
                {deletingAccount ? 'Deleting...' : 'Yes, delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
