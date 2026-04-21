'use client';

import { UIEvent, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { apiFetch } from '@/lib/api';
import { NoteItem, NoteShareItem } from '@/types/note';
import { WorkspaceItem } from '@/types/workspace';
import { PaginationMeta } from '@/types/pagination';
import { buildPagedPath } from '@/lib/pagination';
import NoteEditor from './NoteEditor';

type ViewMode = 'all' | 'editor';
type NoteScope = 'all' | 'mine' | 'shared_with_me' | 'shared_by_me';

interface Props {
  initialNotes: NoteItem[];
}

const LAST_OPEN_NOTE_KEY = 'planora.notes.lastOpenNoteId';

const htmlToPlainText = (html: string) => {
  if (!html) return '';

  if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return (doc.body.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export default function NotesHome({ initialNotes }: Props) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const token = session?.user.accessToken || '';

  const [notes, setNotes] = useState<NoteItem[]>(initialNotes);
  const [mode, setMode] = useState<ViewMode>('all');
  const [activeScope, setActiveScope] = useState<NoteScope>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [pinnedInput, setPinnedInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshingNotes, setRefreshingNotes] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [loadingShares, setLoadingShares] = useState(false);
  const [shares, setShares] = useState<NoteShareItem[]>([]);
  const [shareWorkspaceId, setShareWorkspaceId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const [handledQueryNote, setHandledQueryNote] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [notesPagination, setNotesPagination] = useState<PaginationMeta | null>(null);
  const [notesNextPage, setNotesNextPage] = useState(2);
  const [notesHasMore, setNotesHasMore] = useState(false);
  const [loadingMoreNotes, setLoadingMoreNotes] = useState(false);
  const [restoredNoteId, setRestoredNoteId] = useState<string | null | undefined>(undefined);

  const NOTES_LIMIT = 24;

  const selectedNote = useMemo(
    () => notes.find(note => note.id === selectedId) || null,
    [notes, selectedId]
  );

  const canEditSelected = selectedNote ? selectedNote.access_permission !== 'viewer' : false;
  const isViewerSelected = selectedNote?.access_permission === 'viewer';
  const isOwnerSelected = selectedNote?.access_permission === 'owner';
  const requestedNoteId = searchParams.get('note');

  const shareableWorkspaces = useMemo(() => {
    const existing = new Set(shares.map((share) => share.workspace_id));
    return workspaces.filter((workspace) => !existing.has(workspace.id));
  }, [workspaces, shares]);

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...notes]
      .filter((note) => {
        if (onlyPinned && !note.is_pinned) return false;
        if (!q) return true;
        const previewText = htmlToPlainText(note.content || '');
        return `${note.title || ''} ${previewText}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [notes, searchQuery, onlyPinned]);

  const scopeLabel = useMemo(() => {
    if (activeScope === 'mine') return 'Personal notes';
    if (activeScope === 'shared_with_me') return 'Notes shared with me';
    if (activeScope === 'shared_by_me') return 'Notes shared by me';
    return 'All accessible notes';
  }, [activeScope]);

  const openNote = (note: NoteItem) => {
    setSelectedId(note.id);
    setTitleInput(note.title || '');
    setContentInput(note.content || '');
    setPinnedInput(Boolean(note.is_pinned));
    setMode('editor');
    setShowSharePanel(false);
    setShares([]);
    setShareError('');
    setError('');
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAST_OPEN_NOTE_KEY, note.id);
    }
  };

  const goToAllNotes = () => {
    setMode('all');
    setSelectedId(null);
    setShowSharePanel(false);
    setShares([]);
    setShareError('');
    setError('');
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LAST_OPEN_NOTE_KEY);
    }
  };

  const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]) => {
    const seen = new Set(existing.map((item) => item.id));
    const merged = [...existing];
    for (const item of incoming) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  };

  const loadNotes = async (
    options: {
      scopeParam?: NoteScope;
      page?: number;
      reset?: boolean;
      append?: boolean;
      silent?: boolean;
    } = {}
  ) => {
    if (!token) return;

    const scopeParam = options.scopeParam ?? activeScope;
    const page = options.page ?? 1;
    const reset = options.reset ?? false;
    const append = options.append ?? false;
    const silent = options.silent ?? false;

    if (append) setLoadingMoreNotes(true);
    if (!silent && !append) setRefreshingNotes(true);
    try {
      const path = buildPagedPath('/api/notes', page, NOTES_LIMIT, {
        scope: scopeParam,
        q: searchQuery.trim() || undefined,
        pinned: onlyPinned ? true : undefined,
      });
      const res = await apiFetch<{ notes: NoteItem[]; pagination?: PaginationMeta }>(path, token);
      const list = res.notes || [];
      const pagination = res.pagination || null;

      if (append) {
        setNotes((prev) => mergeById(prev, list));
      } else if (reset) {
        setNotes(list);
      }

      setNotesPagination(pagination);
      setNotesHasMore(Boolean(pagination?.has_next));
      setNotesNextPage((pagination?.page || page) + 1);
    } catch {
      // Keep current state if background refresh fails.
    } finally {
      if (append) setLoadingMoreNotes(false);
      if (!silent && !append) setRefreshingNotes(false);
    }
  };

  const refreshNotes = async (scopeParam: NoteScope = activeScope) => {
    await loadNotes({ scopeParam, page: 1, reset: true, silent: true });
  };

  const createNote = async () => {
    if (!token || creating) return;

    setCreating(true);
    setError('');
    try {
      const res = await apiFetch<{ note: NoteItem }>('/api/notes', token, {
        method: 'POST',
        body: JSON.stringify({ title: '', content: '', is_pinned: false }),
      });
      setNotes(prev => [res.note, ...prev]);
      openNote(res.note);
    } catch (err: any) {
      setError(err.message || 'Could not create note.');
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadNotes({ scopeParam: activeScope, page: 1, reset: true });
  }, [token, activeScope, searchQuery, onlyPinned]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(LAST_OPEN_NOTE_KEY);
    setRestoredNoteId(stored || null);
  }, []);

  useEffect(() => {
    if (!token || !selectedId || mode !== 'editor') return;
    if (!selectedNote) return;

    const existingTitle = selectedNote.title || '';
    const existingContent = selectedNote.content || '';
    const existingPinned = Boolean(selectedNote.is_pinned);
    const titleChanged = titleInput !== existingTitle;
    const contentChanged = contentInput !== existingContent;
    const pinnedChanged = pinnedInput !== existingPinned;

    if (!titleChanged && !contentChanged && !pinnedChanged) return;

    const payload: { title?: string; content?: string; is_pinned?: boolean } = {};
    if (canEditSelected) {
      if (titleChanged) payload.title = titleInput;
      if (contentChanged) payload.content = contentInput;
    }
    if (pinnedChanged) {
      payload.is_pinned = pinnedInput;
    }
    if (Object.keys(payload).length === 0) return;
    const hasContentEdit = titleChanged || contentChanged;

    const timeout = setTimeout(async () => {
      setSaving(true);
      setError('');
      try {
        const res = await apiFetch<{ note: NoteItem }>(`/api/notes/${selectedId}`, token, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setNotes(prev => prev.map(note => (note.id === res.note.id ? res.note : note)));
        if (hasContentEdit) {
          setSavedAt(new Date().toISOString());
        }
      } catch (err: any) {
        setError(err.message || 'Could not save note.');
      } finally {
        setSaving(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [token, selectedId, mode, selectedNote, titleInput, contentInput, pinnedInput, canEditSelected]);

  useEffect(() => {
    if (!token) return;

    const loadWorkspaces = async () => {
      try {
        const path = buildPagedPath('/api/workspaces', 1, 50);
        const res = await apiFetch<{ workspaces: WorkspaceItem[] }>(path, token);
        setWorkspaces(res.workspaces || []);
      } catch {
        setWorkspaces([]);
      }
    };

    loadWorkspaces();
  }, [token]);

  useEffect(() => {
    if (handledQueryNote) return;
    if (restoredNoteId === undefined) return;
    const targetNoteId = requestedNoteId || restoredNoteId;

    if (!targetNoteId) {
      setHandledQueryNote(true);
      return;
    }
    const target = notes.find((note) => note.id === targetNoteId);
    if (target) {
      openNote(target);
      setHandledQueryNote(true);
      return;
    }
    if (!refreshingNotes && activeScope !== 'all') {
      setActiveScope('all');
      return;
    }
    if (!refreshingNotes && activeScope === 'all') {
      if (!requestedNoteId && restoredNoteId && typeof window !== 'undefined') {
        window.localStorage.removeItem(LAST_OPEN_NOTE_KEY);
        setRestoredNoteId(null);
      }
      setHandledQueryNote(true);
    }
  }, [requestedNoteId, restoredNoteId, notes, handledQueryNote, refreshingNotes, activeScope]);

  const loadShares = async (noteId: string) => {
    if (!token) return;

    setLoadingShares(true);
    setShareError('');
    try {
      const res = await apiFetch<{ shares: NoteShareItem[] }>(`/api/notes/${noteId}/shares`, token);
      setShares(res.shares || []);
      const available = workspaces.filter((workspace) => !res.shares.some((share) => share.workspace_id === workspace.id));
      setShareWorkspaceId(available[0]?.id || '');
    } catch (err: any) {
      setShareError(err.message || 'Could not load sharing settings.');
      setShares([]);
    } finally {
      setLoadingShares(false);
    }
  };

  const toggleSharePanel = async () => {
    if (!selectedNote || !isOwnerSelected) return;

    if (showSharePanel) {
      setShowSharePanel(false);
      return;
    }

    setShowSharePanel(true);
    await loadShares(selectedNote.id);
  };

  const shareSelectedNote = async () => {
    if (!selectedNote || !token || !isOwnerSelected || !shareWorkspaceId) return;

    setSharing(true);
    setShareError('');
    try {
      await apiFetch<{ share: NoteShareItem }>(`/api/notes/${selectedNote.id}/shares`, token, {
        method: 'POST',
        body: JSON.stringify({ workspace_id: shareWorkspaceId }),
      });
      await loadShares(selectedNote.id);
      await refreshNotes(activeScope);
    } catch (err: any) {
      setShareError(err.message || 'Could not share note.');
    } finally {
      setSharing(false);
    }
  };

  const unshareSelectedNote = async (workspaceId: string) => {
    if (!selectedNote || !token || !isOwnerSelected) return;

    setSharing(true);
    setShareError('');
    try {
      await apiFetch<{ message: string }>(`/api/notes/${selectedNote.id}/shares/${workspaceId}`, token, {
        method: 'DELETE',
      });
      await loadShares(selectedNote.id);
      await refreshNotes(activeScope);
    } catch (err: any) {
      setShareError(err.message || 'Could not remove sharing.');
    } finally {
      setSharing(false);
    }
  };

  const deleteNote = async () => {
    if (!token || !selectedId) return;

    setShowDeleteConfirm(false);
    try {
      await apiFetch<{ message: string }>(`/api/notes/${selectedId}`, token, { method: 'DELETE' });
      setNotes(prev => prev.filter(note => note.id !== selectedId));
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LAST_OPEN_NOTE_KEY);
      }
      setRestoredNoteId(null);
      await refreshNotes(activeScope);
      goToAllNotes();
    } catch (err: any) {
      setError(err.message || 'Could not delete note.');
    }
  };

  const loadMoreNotes = async () => {
    if (!notesHasMore || loadingMoreNotes || refreshingNotes) return;
    await loadNotes({ page: notesNextPage, append: true, silent: true });
  };

  const isNearBottom = (element: HTMLDivElement, threshold = 140) => (
    element.scrollTop + element.clientHeight >= element.scrollHeight - threshold
  );

  const handleNotesScroll = (event: UIEvent<HTMLDivElement>) => {
    if (isNearBottom(event.currentTarget)) {
      void loadMoreNotes();
    }
  };

  return (
    <div
      className="grid grid-cols-1 gap-5 min-h-0 lg:h-[calc(100dvh-8rem)] lg:grid-cols-[320px_minmax(0,1fr)]"
    >
      <aside className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-3 flex flex-col gap-4 overflow-visible lg:overflow-hidden lg:max-h-full">
        <button
          onClick={createNote}
          disabled={creating}
          className="w-full h-11 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60"
        >
          {creating ? 'Creating...' : '+ New note'}
        </button>

        <button
          onClick={() => {
            setActiveScope('all');
            goToAllNotes();
          }}
          className={`w-full h-11 rounded-xl text-sm font-medium border transition-colors ${activeScope === 'all' ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]' : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
        >
          All notes
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              setActiveScope('mine');
              goToAllNotes();
            }}
            className={`h-10 rounded-lg text-xs font-medium border transition-colors ${activeScope === 'mine' ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-[var(--primary)]/40' : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
          >
            Personal
          </button>
          <button
            onClick={() => {
              setActiveScope('shared_with_me');
              goToAllNotes();
            }}
            className={`h-10 rounded-lg text-xs font-medium border transition-colors ${activeScope === 'shared_with_me' ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-[var(--primary)]/40' : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
          >
            With me
          </button>
          <button
            onClick={() => {
              setActiveScope('shared_by_me');
              goToAllNotes();
            }}
            className={`h-10 rounded-lg text-xs font-medium border transition-colors ${activeScope === 'shared_by_me' ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-[var(--primary)]/40' : 'border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]'}`}
          >
            By me
          </button>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
            placeholder="Search"
            className="h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
          />
          <button
            onClick={() => {
              setOnlyPinned(prev => !prev);
            }}
            className={`h-10 px-3 rounded-xl border text-xs ${onlyPinned ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--muted-foreground)]'}`}
          >
            Pinned
          </button>
        </div>

        <div onScroll={handleNotesScroll} className="rounded-xl border border-[var(--border)] bg-[var(--background)]/70 p-2 flex-1 overflow-y-auto">
          <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)] px-2 pb-2">Recent</p>
          <div className="space-y-1">
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => openNote(note)}
                className={`w-full text-left px-2 py-2 rounded-lg text-sm ${selectedId === note.id && mode === 'editor' ? 'bg-[var(--primary)]/12 border border-[var(--primary)]/40' : 'hover:bg-[var(--muted)]'}`}
              >
                <p className="font-medium truncate">{note.is_pinned ? 'Pinned · ' : ''}{note.title?.trim() || 'Untitled'}</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1 truncate">
                  {htmlToPlainText(note.content || '') || 'Empty note'}
                </p>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                  {note.access_scope === 'shared_with_me'
                    ? `Shared with you (${note.access_permission})`
                    : note.access_scope === 'shared_by_me'
                      ? `Shared to ${note.shared_workspaces.length > 0 ? note.shared_workspaces.join(', ') : 'collaboration groups'}`
                      : 'Private'}
                </p>
              </button>
            ))}
            {filteredNotes.length === 0 && (
              <p className="text-xs text-[var(--muted-foreground)] px-2 py-2">No notes yet</p>
            )}
            {loadingMoreNotes && <p className="text-xs text-[var(--muted-foreground)] px-2 py-2">Loading more notes...</p>}
          </div>
        </div>
      </aside>

      <section className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-4 sm:p-5 overflow-visible lg:overflow-hidden relative z-30 min-h-[460px] lg:min-h-0">
        {mode === 'all' && (
          <div className="h-full flex flex-col">
            <div className="mb-4">
              <h1 className="text-2xl font-semibold">Home</h1>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">{scopeLabel}</p>
            </div>

            <div onScroll={handleNotesScroll} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto pr-1">
              {filteredNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => openNote(note)}
                  className="min-h-[210px] rounded-2xl border border-[var(--border)] bg-[var(--background)]/60 p-4 text-left hover:bg-[var(--muted)]/80 transition-colors flex flex-col"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {note.access_scope === 'shared_with_me' ? 'Shared note' : note.access_scope === 'shared_by_me' ? 'Shared by you' : 'Personal note'}
                    </p>
                    {note.is_pinned && <p className="text-xs text-[var(--primary)]">Pinned</p>}
                  </div>
                  <h3 className="text-lg font-semibold mt-2 line-clamp-2">{note.title?.trim() || 'Untitled'}</h3>
                  <p className="text-sm text-[var(--muted-foreground)] mt-2 line-clamp-4">
                    {htmlToPlainText(note.content || '') || 'Empty note'}
                  </p>
                  <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {note.access_scope === 'shared_with_me'
                        ? `Shared with you (${note.access_permission})`
                        : note.access_scope === 'shared_by_me'
                          ? `Shared to ${note.shared_workspaces.length > 0 ? note.shared_workspaces.join(', ') : 'collaboration groups'}`
                          : 'Private'}
                    </p>
                    <p className="text-[11px] text-[var(--muted-foreground)] shrink-0 text-right">
                      {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                </button>
              ))}

              {(activeScope === 'all' || activeScope === 'mine' || activeScope === 'shared_by_me') && (
                <button
                  onClick={createNote}
                  className="min-h-[210px] rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background)]/40 p-4 hover:bg-[var(--muted)]/70 transition-colors flex flex-col items-center justify-center"
                >
                  <div className="w-12 h-12 rounded-full bg-[var(--primary)]/20 text-[var(--primary)] flex items-center justify-center text-2xl">+</div>
                  <p className="mt-3 text-sm font-semibold">Create new note</p>
                </button>
              )}
              {loadingMoreNotes && (
                <p className="text-sm text-[var(--muted-foreground)] col-span-full">Loading more notes...</p>
              )}
            </div>
          </div>
        )}

        {mode === 'editor' && selectedNote && (
          <div className="h-full flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--border)] pb-3">
              <button
                onClick={goToAllNotes}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--muted)]"
              >
                All notes
              </button>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setPinnedInput(prev => !prev)}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${pinnedInput ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--muted-foreground)]'}`}
                >
                  {pinnedInput ? 'Pinned' : 'Pin'}
                </button>
                {isOwnerSelected && (
                  <button
                    onClick={toggleSharePanel}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${showSharePanel ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--muted-foreground)]'}`}
                  >
                    {showSharePanel ? 'Close sharing' : 'Share'}
                  </button>
                )}
                <button
                  disabled={saving || !isOwnerSelected}
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--destructive)]/40 text-[var(--destructive)] text-sm disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>

            {showSharePanel && isOwnerSelected && (
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)]/60 p-3 space-y-3">
                <p className="text-sm font-medium">Share note with collaboration groups</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={shareWorkspaceId}
                    onChange={(e) => setShareWorkspaceId(e.target.value)}
                    className="appearance-none h-9 min-w-[180px] px-3 pr-8 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23888' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m2 5 6 6 6-6'/%3e%3c/svg%3e")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.5rem center',
                      backgroundSize: '1.25rem',
                    }}
                  >
                    {shareableWorkspaces.length === 0 && <option value="">No available groups</option>}
                    {shareableWorkspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={shareSelectedNote}
                    disabled={!shareWorkspaceId || sharing || shareableWorkspaces.length === 0}
                    className="h-9 px-3 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm disabled:opacity-60"
                  >
                    {sharing ? 'Sharing...' : 'Share'}
                  </button>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]/70 p-2 max-h-[180px] overflow-y-auto space-y-1">
                  {loadingShares && <p className="text-xs text-[var(--muted-foreground)]">Loading sharing settings...</p>}
                  {!loadingShares && shares.length === 0 && <p className="text-xs text-[var(--muted-foreground)]">This note is not shared to any group yet.</p>}
                  {!loadingShares && shares.map((share) => (
                    <div key={share.workspace_id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--muted)]/60">
                      <p className="text-sm truncate">{share.workspace_name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-1 rounded border border-[var(--border)] bg-[var(--muted)]/50 text-[var(--muted-foreground)]">
                          View only
                        </span>
                        <button
                          onClick={() => unshareSelectedNote(share.workspace_id)}
                          disabled={sharing}
                          className="text-xs px-2 py-1 rounded border border-[var(--destructive)]/35 text-[var(--destructive)] disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {shareError && <p className="text-xs text-[var(--destructive)]">{shareError}</p>}
              </div>
            )}

            <input
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              disabled={!canEditSelected}
              placeholder="Untitled"
              className="mt-4 text-2xl font-semibold bg-transparent outline-none"
            />

            <div className="mt-3 flex-1 flex flex-col min-h-0 relative z-40 pointer-events-auto">
              <NoteEditor
                value={contentInput}
                onChange={(e) => setContentInput(e)}
                disabled={!canEditSelected}
                placeholder="Start writing your note..."
                showStatus={
                  saving ? 'Autosaving...' : savedAt ? `Saved ${formatDistanceToNow(new Date(savedAt), { addSuffix: true })}` : 'Auto-saved'
                }
              />
            </div>
          </div>
        )}

        {(error || refreshingNotes) && (
          <p className="text-sm mt-3 text-[var(--destructive)]">
            {error || (refreshingNotes ? 'Refreshing notes...' : '')}
          </p>
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/45">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Are you sure?</h3>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Deleting this note is permanent and cannot be reverted.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm hover:bg-[var(--muted)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={deleteNote}
                  className="px-3 py-1.5 rounded-lg border border-[var(--destructive)]/45 bg-[var(--destructive)]/10 text-[var(--destructive)] text-sm font-medium hover:bg-[var(--destructive)]/20"
                >
                  Delete permanently
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
