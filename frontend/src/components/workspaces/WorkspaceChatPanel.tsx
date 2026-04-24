'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { format, isToday, isYesterday } from 'date-fns';
import { apiFetch } from '@/lib/api';
import { WorkspaceMessageItem } from '@/types/workspace';
import { PaginationMeta } from '@/types/pagination';
import { buildPagedPath } from '@/lib/pagination';
import { Send } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface Props {
  workspaceId: string;
  workspaceName: string;
  onMessageSent?: () => Promise<void> | void;
}

export default function WorkspaceChatPanel({ workspaceId, workspaceName, onMessageSent }: Props) {
  const { data: session } = useSession();
  const token = session?.user.accessToken || '';
  const currentUserId = session?.user.id || '';

  const [messages, setMessages] = useState<WorkspaceMessageItem[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [nextOlderPage, setNextOlderPage] = useState(2);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldPinToBottomRef = useRef(false);
  const restoreScrollRef = useRef<{ previousHeight: number; previousTop: number } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const CHAT_LIMIT = 80;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const groupedMessages = useMemo(() => messages, [messages]);

  const getMessageDayKey = (value: string) => format(new Date(value), 'yyyy-MM-dd');
  const getMessageDayLabel = (value: string) => {
    const date = new Date(value);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, MMM d, yyyy');
  };

  const fetchPage = async (page: number) => {
    const path = buildPagedPath(`/api/workspaces/${workspaceId}/messages`, page, CHAT_LIMIT);
    return apiFetch<{ messages: WorkspaceMessageItem[]; pagination?: PaginationMeta }>(path, token);
  };

  const loadInitialMessages = async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetchPage(1);
      setMessages(res.messages || []);
      setHasMoreOlder(Boolean(res.pagination?.has_next));
      setNextOlderPage(2);
      shouldPinToBottomRef.current = true;
    } catch (err: any) {
      setError(err.message || 'Could not load chat messages.');
    } finally {
      setLoading(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!token || !workspaceId || loading || loadingMore || !hasMoreOlder) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    setLoadingMore(true);
    setError('');
    restoreScrollRef.current = {
      previousHeight: container.scrollHeight,
      previousTop: container.scrollTop,
    };

    try {
      const res = await fetchPage(nextOlderPage);
      const olderBatch = res.messages || [];
      setMessages((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        const dedupedOlder = olderBatch.filter((item) => !seen.has(item.id));
        return [...dedupedOlder, ...prev];
      });
      setHasMoreOlder(Boolean(res.pagination?.has_next));
      setNextOlderPage((prev) => prev + 1);
    } catch (err: any) {
      setError(err.message || 'Could not load older messages.');
      restoreScrollRef.current = null;
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setMessages([]);
    setHasMoreOlder(false);
    setNextOlderPage(2);
    restoreScrollRef.current = null;
    shouldPinToBottomRef.current = false;
    loadInitialMessages();
  }, [workspaceId, token]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      if (restoreScrollRef.current) {
        const { previousHeight, previousTop } = restoreScrollRef.current;
        const newHeight = container.scrollHeight;
        container.scrollTop = previousTop + (newHeight - previousHeight);
        restoreScrollRef.current = null;
        return;
      }

      if (shouldPinToBottomRef.current) {
        container.scrollTop = container.scrollHeight;
        shouldPinToBottomRef.current = false;
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [messages.length, loading, loadingMore]);

  useEffect(() => {
    if (!token) return;

    const socket = io(apiUrl, {
      transports: ['websocket'],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on('workspace:message:new', (incoming: WorkspaceMessageItem) => {
      if (!incoming || incoming.workspace_id !== workspaceId) return;
      setMessages((prev) => (prev.some((item) => item.id === incoming.id) ? prev : [...prev, incoming]));
      shouldPinToBottomRef.current = true;
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [apiUrl, token, workspaceId]);

  const sendMessage = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (!token || !workspaceId || sending) return;

    const content = messageInput.trim();
    if (!content) return;

    setSending(true);
    setError('');

    try {
      const res = await apiFetch<{ message: WorkspaceMessageItem }>(`/api/workspaces/${workspaceId}/messages`, token, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      setMessages((prev) => (prev.some((item) => item.id === res.message.id) ? prev : [...prev, res.message]));
      shouldPinToBottomRef.current = true;
      setMessageInput('');
      await onMessageSent?.();
    } catch (err: any) {
      setError(err.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (container.scrollTop <= 60) {
      loadOlderMessages();
    }
  };

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)]/75 p-4 flex flex-col h-[min(72dvh,820px)] xl:h-full min-h-[420px] overflow-hidden">
      <div className="mb-3">
        <h3 className="text-xl font-semibold leading-tight">{workspaceName}</h3>
      </div>

      <div className="flex-1 min-h-0 rounded-[24px] border border-[var(--border)] bg-[linear-gradient(180deg,var(--background),var(--card))] p-2.5 overflow-hidden flex flex-col">
        <div ref={scrollContainerRef} onScroll={handleScroll} className="compact-scrollbar flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-2">
          {loading && <p className="text-sm text-[var(--muted-foreground)]">Loading chat...</p>}
          {!loading && loadingMore && (
            <p className="text-xs text-[var(--muted-foreground)] text-center">Loading older messages...</p>
          )}
          {!loading && groupedMessages.length === 0 && (
            <div className="h-full min-h-[240px] flex items-center justify-center text-center text-sm text-[var(--muted-foreground)]">
              <div>
                <p className="font-medium text-[var(--foreground)]">No messages yet</p>
                <p className="mt-1">Start the conversation for {workspaceName} here.</p>
              </div>
            </div>
          )}

          {groupedMessages.map((message, index) => {
            const isMine = message.user_id === currentUserId;
            const dayKey = getMessageDayKey(message.created_at);
            const prevDayKey = index > 0 ? getMessageDayKey(groupedMessages[index - 1].created_at) : null;
            const showDaySeparator = index === 0 || dayKey !== prevDayKey;

            return (
              <div key={message.id}>
                {showDaySeparator && (
                  <div className="py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-px flex-1 bg-[var(--border)]/70" />
                      <span className="text-[11px] text-[var(--muted-foreground)] px-2">{getMessageDayLabel(message.created_at)}</span>
                      <span className="h-px flex-1 bg-[var(--border)]/70" />
                    </div>
                  </div>
                )}

                <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[68%] rounded-[18px] px-3 py-2 border ${isMine ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent' : 'bg-[var(--card)] border-[var(--border)]'}`}>
                    <div className="flex items-center justify-between gap-3 mb-0.5">
                      <p className="text-xs font-semibold opacity-85">{isMine ? 'You' : message.author_name}</p>
                      <p
                        title={format(new Date(message.created_at), 'EEEE, MMM d, yyyy HH:mm')}
                        className={`text-[10px] ${isMine ? 'opacity-70' : 'text-[var(--muted-foreground)]'}`}
                      >
                        {format(new Date(message.created_at), 'HH:mm')}
                      </p>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words leading-snug">{message.content}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="mt-2 text-xs text-[var(--destructive)]">{error}</p>}

        <form onSubmit={sendMessage} className="mt-3 grid grid-cols-[minmax(0,1fr)_76px] gap-2 items-stretch">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message..."
            className="h-[42px] px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 text-sm outline-none resize-none focus:ring-2 focus:ring-[var(--ring)] shadow-sm"
          />
          <button
            type="submit"
            disabled={sending || !messageInput.trim()}
            className="h-[42px] px-3 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium inline-flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> {sending ? 'Sending' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
