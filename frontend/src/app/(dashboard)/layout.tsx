'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { apiFetch } from '@/lib/api';
import { NotificationItem, NotificationPreferenceItem } from '@/types/notification';
import PlanoraLogoMark from '@/components/shared/PlanoraLogoMark';
import { io, Socket } from 'socket.io-client';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [notifError, setNotifError] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [hasUnseenCollabMessages, setHasUnseenCollabMessages] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const pathnameRef = useRef(pathname);
  const previousPathnameRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string>('');

  const token = session?.user.accessToken || '';
  const currentUserId = session?.user.id || '';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('planora-theme') : null;
    const theme = stored || session?.user.theme || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [session?.user.theme]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }

      if (!notifRef.current) return;
      if (!notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const loadNotifications = async () => {
    if (!token) return;
    setNotifLoading(true);
    setNotifError('');
    try {
      const [notifRes, countRes] = await Promise.all([
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications?limit=20', token),
        apiFetch<{ unread_count: number }>('/api/notifications/unread-count', token),
      ]);
      setNotifications(notifRes.notifications || []);
      setUnreadCount(countRes.unread_count || 0);
    } catch (err: any) {
      setNotifError(err.message || 'Failed to load notifications.');
    } finally {
      setNotifLoading(false);
    }
  };

  const loadNotificationPreferences = async () => {
    if (!token) return;
    try {
      const res = await apiFetch<{ preferences: NotificationPreferenceItem[] }>('/api/notifications/preferences', token);
      const next: Record<string, boolean> = {};
      for (const pref of res.preferences || []) {
        next[pref.type] = pref.is_muted;
      }
      setPreferences(next);
    } catch {
      // Defaults remain unmuted.
    }
  };

  const loadCollabUnreadSummary = async () => {
    if (!token) return;
    try {
      const res = await apiFetch<{ has_unseen_messages: boolean }>('/api/workspaces/chat-unread-summary', token);
      setHasUnseenCollabMessages(Boolean(res.has_unseen_messages));
    } catch {
      setHasUnseenCollabMessages(false);
    }
  };

  const markCollabSeen = async () => {
    if (!token) return;
    try {
      await apiFetch<{ message: string }>('/api/workspaces/chats/mark-seen', token, {
        method: 'POST',
      });
    } catch {
      // Keep silent to avoid disrupting navigation flow.
    }
  };

  const markNotificationRead = async (id: string) => {
    if (!token) return;
    try {
      await apiFetch<{ notification: NotificationItem }>(`/api/notifications/${id}/read`, token, {
        method: 'POST',
      });
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Keep silent to avoid noisy UX on repeated click.
    }
  };

  const markAllRead = async () => {
    if (!token || markingAll) return;
    setMarkingAll(true);
    try {
      await apiFetch<{ message: string }>('/api/notifications/mark-all-read', token, {
        method: 'POST',
      });
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch (err: any) {
      setNotifError(err.message || 'Failed to mark all as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadNotifications();
    loadNotificationPreferences();
    loadCollabUnreadSummary();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const wasOnWorkspaces = Boolean(previousPathnameRef.current?.startsWith('/collaboration'));
    const isOnWorkspaces = Boolean(pathname?.startsWith('/collaboration'));

    if (isOnWorkspaces) {
      setHasUnseenCollabMessages(false);
      void markCollabSeen();
      previousPathnameRef.current = pathname;
      return;
    }

    if (wasOnWorkspaces) {
      void (async () => {
        await markCollabSeen();
        await loadCollabUnreadSummary();
      })();
      previousPathnameRef.current = pathname;
      return;
    }

    void loadCollabUnreadSummary();
    previousPathnameRef.current = pathname;
  }, [pathname, token]);

  useEffect(() => {
    if (!token) return;

    const loadProfileAvatar = async () => {
      try {
        const res = await apiFetch<{ user: { avatar_url: string | null } }>('/api/auth/me', token);
        setUserAvatarUrl(res.user.avatar_url || null);
      } catch {
        setUserAvatarUrl(null);
      }
    };

    loadProfileAvatar();
  }, [token, session]);

  const setNotificationMute = async (type: string, isMuted: boolean) => {
    if (!token) return;
    setSavingPrefs(true);
    try {
      await apiFetch<{ preference: NotificationPreferenceItem }>('/api/notifications/preferences', token, {
        method: 'PUT',
        body: JSON.stringify({ type, is_muted: isMuted }),
      });
      setPreferences((prev) => ({ ...prev, [type]: isMuted }));
    } catch (err: any) {
      setNotifError(err.message || 'Failed to update notification settings.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const globalMuted = Boolean(preferences.global_all);

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      await markNotificationRead(item.id);
    }

    const target = item.metadata && typeof item.metadata.target === 'string'
      ? item.metadata.target
      : null;

    const workspaceId = item.metadata && typeof item.metadata.workspace_id === 'string'
      ? item.metadata.workspace_id
      : null;
    const invitationId = item.metadata && typeof item.metadata.invitation_id === 'string'
      ? item.metadata.invitation_id
      : null;

    if (workspaceId) {
      const query = new URLSearchParams();
      query.set('workspace', workspaceId);
      if (invitationId) query.set('invitation', invitationId);
      router.push(`/collaboration?${query.toString()}`);
      setNotifOpen(false);
      return;
    }

    if (target === 'workspace_calendar') {
      router.push('/workspace');
      setNotifOpen(false);
      return;
    }

    router.push('/collaboration');
    setNotifOpen(false);
  };

  useEffect(() => {
    if (!token) return;

    const socket = io(apiUrl, {
      transports: ['websocket'],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('notification:new', (payload: NotificationItem) => {
      setNotifications((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)].slice(0, 20));
      if (!payload.is_read) {
        setUnreadCount((prev) => prev + 1);
      }
    });

    socket.on('notification:read', ({ id }: { id: string }) => {
      let decremented = false;
      setNotifications((prev) =>
        prev.map((item) => {
          if (item.id === id && !item.is_read) {
            decremented = true;
            return { ...item, is_read: true };
          }
          return item;
        })
      );
      if (decremented) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    });

    socket.on('notification:read_all', () => {
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    });

    socket.on('workspace:message:new', (payload: { user_id?: string }) => {
      const onCollabPage = pathnameRef.current?.startsWith('/collaboration');
      const isOwnMessage = payload?.user_id && payload.user_id === currentUserIdRef.current;
      if (onCollabPage && !isOwnMessage) {
        setHasUnseenCollabMessages(false);
        void markCollabSeen();
        return;
      }

      if (!isOwnMessage) {
        setHasUnseenCollabMessages(true);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [apiUrl, token]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="w-6 h-6 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
      {/* Top Nav */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)]/90 bg-[var(--background)]/90 backdrop-blur-xl px-3 sm:px-4 md:px-6 py-3 flex items-center justify-between gap-3 md:gap-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 overflow-hidden">
          <div className="hidden sm:flex items-center gap-0.5">
            <div className="flex items-center justify-center">
              <PlanoraLogoMark className="h-8 w-8" />
            </div>
            <span className="font-semibold tracking-tight">Planora</span>
          </div>

          <nav className="flex items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-1 overflow-x-auto whitespace-nowrap max-w-[56vw] sm:max-w-none">
            {[
              { label: 'Workspace', href: '/workspace' },
              { label: 'Notes', href: '/notes' },
              { label: 'Collaboration', href: '/collaboration' },
            ].map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const showCollabDot = item.href === '/collaboration' && hasUnseenCollabMessages && !active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-xl text-sm transition-colors ${active ? 'bg-[var(--secondary)] text-[var(--secondary-foreground)] font-medium' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
                >
                  <span className="relative inline-block pr-1">
                    <span>{item.label}</span>
                    {showCollabDot && (
                      <span
                        className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-[var(--destructive)]"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                const next = !notifOpen;
                setNotifOpen(next);
                if (next) loadNotifications();
              }}
              className="relative h-9 w-9 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] inline-flex items-center justify-center transition-colors"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[var(--destructive)] text-white text-[10px] leading-4 text-center font-semibold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[0_14px_32px_rgba(9,25,48,0.16)] z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Notifications</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{unreadCount} unread</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setNotificationMute('global_all', !globalMuted)}
                      disabled={savingPrefs}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border)] text-xs inline-flex items-center gap-2 disabled:opacity-50"
                      aria-pressed={globalMuted}
                      title="Mute or unmute all notifications"
                    >
                      <span className={`relative h-4 w-8 rounded-full transition-colors ${globalMuted ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}`}>
                        <span
                          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${globalMuted ? 'translate-x-4' : 'translate-x-0'}`}
                        />
                      </span>
                      {globalMuted ? 'Muted' : 'Enabled'}
                    </button>
                    <button
                      onClick={markAllRead}
                      disabled={markingAll || unreadCount === 0}
                      className="h-8 px-2.5 rounded-lg border border-[var(--border)] text-xs disabled:opacity-50"
                    >
                      {markingAll ? 'Marking...' : 'Mark all read'}
                    </button>
                  </div>
                </div>

                <div className="max-h-[360px] overflow-y-auto p-2">
                  {notifLoading && <p className="text-xs text-[var(--muted-foreground)] px-2 py-2">Loading...</p>}
                  {!notifLoading && notifError && <p className="text-xs text-[var(--destructive)] px-2 py-2">{notifError}</p>}
                  {!notifLoading && !notifError && notifications.length === 0 && (
                    <p className="text-xs text-[var(--muted-foreground)] px-2 py-2">No notifications yet.</p>
                  )}

                  {!notifLoading && notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors mb-1 ${item.is_read ? 'border-transparent bg-[var(--card)] hover:bg-[var(--muted)]/50' : 'border-[var(--border)] bg-[var(--muted)]/45 hover:bg-[var(--muted)]'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{item.title}</p>
                        {!item.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-[var(--primary)] shrink-0" />}
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{item.message}</p>
                      <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                      </p>
                    </button>
                  ))}
                </div>

              </div>
            )}
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(prev => !prev)}
              className="w-10 h-10 rounded-full border border-[var(--border)] bg-[var(--card)] overflow-hidden flex items-center justify-center shadow-[0_4px_14px_rgba(17,29,66,0.12)]"
            >
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-[var(--muted-foreground)]">
                  {(session.user.name?.charAt(0) || 'U').toUpperCase()}
                </span>
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-40 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_30px_rgba(9,25,48,0.18)] p-1 z-40">
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="block w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[var(--muted)]"
                >
                  Profile settings
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="block w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[var(--muted)]"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 p-3 sm:p-4 md:p-5 lg:p-6">{children}</main>
    </div>
  );
}
