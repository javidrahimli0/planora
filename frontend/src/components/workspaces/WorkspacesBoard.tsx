'use client';

import { UIEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { apiFetch } from '@/lib/api';
import {
  Clock3,
  FileText,
  MailPlus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  WorkspaceInvitationItem,
  WorkspaceItem,
  WorkspaceMemberItem,
  WorkspaceSharedNoteItem,
  WorkspaceEventParticipantItem,
  WorkspaceUpcomingEventItem,
} from '@/types/workspace';
import { PlanoraEvent } from '@/types/event';
import EventModal from '@/components/calendar/EventModal';
import WorkspaceChatPanel from './WorkspaceChatPanel';
import WorkspaceEventDetailModal from './WorkspaceEventDetailModal';
import { PaginationMeta } from '@/types/pagination';
import { buildPagedPath } from '@/lib/pagination';

interface Props {
  initialWorkspaces: WorkspaceItem[];
}

export default function WorkspacesBoard({ initialWorkspaces }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = session?.user.accessToken || '';
  const selectionRestoredRef = useRef(false);

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>(initialWorkspaces);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberItem[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationItem[]>([]);
  const [myInvitations, setMyInvitations] = useState<WorkspaceInvitationItem[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showMyInvitationsModal, setShowMyInvitationsModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showWorkspaceEventModal, setShowWorkspaceEventModal] = useState(false);
  const [showSharedNotesModal, setShowSharedNotesModal] = useState(false);

  const [nameInput, setNameInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [settingsName, setSettingsName] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);
  const [leavingWorkspace, setLeavingWorkspace] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [sharedNotes, setSharedNotes] = useState<WorkspaceSharedNoteItem[]>([]);
  const [loadingSharedNotes, setLoadingSharedNotes] = useState(false);
  const [sharedNotesError, setSharedNotesError] = useState('');
  const [upcomingEvents, setUpcomingEvents] = useState<WorkspaceUpcomingEventItem[]>([]);
  const [loadingUpcomingEvents, setLoadingUpcomingEvents] = useState(false);
  const [upcomingEventsError, setUpcomingEventsError] = useState('');
  const [upcomingEventsPagination, setUpcomingEventsPagination] = useState<PaginationMeta | null>(null);
  const [selectedUpcomingEvent, setSelectedUpcomingEvent] = useState<WorkspaceUpcomingEventItem | null>(null);
  const [selectedUpcomingParticipants, setSelectedUpcomingParticipants] = useState<WorkspaceEventParticipantItem[]>([]);
  const [loadingUpcomingParticipants, setLoadingUpcomingParticipants] = useState(false);
  const [savingParticipation, setSavingParticipation] = useState(false);

  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [assigningOwnerId, setAssigningOwnerId] = useState<string | null>(null);
  const [removingOwnerId, setRemovingOwnerId] = useState<string | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [settingsStatusMessage, setSettingsStatusMessage] = useState('');
  const [error, setError] = useState('');

  const WORKSPACES_LIMIT = 12;
  const MY_INVITES_LIMIT = 10;
  const MEMBERS_LIMIT = 10;
  const INVITATIONS_LIMIT = 10;
  const SHARED_NOTES_LIMIT = 12;
  const UPCOMING_EVENTS_LIMIT = 6;

  const [workspacesPagination, setWorkspacesPagination] = useState<PaginationMeta | null>(null);
  const [myInvitesPagination, setMyInvitesPagination] = useState<PaginationMeta | null>(null);
  const [membersPagination, setMembersPagination] = useState<PaginationMeta | null>(null);
  const [invitationsPagination, setInvitationsPagination] = useState<PaginationMeta | null>(null);
  const [sharedNotesPagination, setSharedNotesPagination] = useState<PaginationMeta | null>(null);
  const [workspacesNextPage, setWorkspacesNextPage] = useState(2);
  const [myInvitesNextPage, setMyInvitesNextPage] = useState(2);
  const [membersNextPage, setMembersNextPage] = useState(2);
  const [invitationsNextPage, setInvitationsNextPage] = useState(2);
  const [sharedNotesNextPage, setSharedNotesNextPage] = useState(2);
  const [workspacesHasMore, setWorkspacesHasMore] = useState(false);
  const [myInvitesHasMore, setMyInvitesHasMore] = useState(false);
  const [membersHasMore, setMembersHasMore] = useState(false);
  const [invitationsHasMore, setInvitationsHasMore] = useState(false);
  const [sharedNotesHasMore, setSharedNotesHasMore] = useState(false);
  const [loadingMoreWorkspaces, setLoadingMoreWorkspaces] = useState(false);
  const [loadingMoreMyInvites, setLoadingMoreMyInvites] = useState(false);
  const [loadingMoreMembers, setLoadingMoreMembers] = useState(false);
  const [loadingMoreInvitations, setLoadingMoreInvitations] = useState(false);
  const [loadingMoreSharedNotes, setLoadingMoreSharedNotes] = useState(false);

  const currentUserId = session?.user.id || '';
  const selectionStorageKey = currentUserId ? `planora:last-workspace:${currentUserId}` : '';

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedId) || null,
    [workspaces, selectedId]
  );

  const isOwner = selectedWorkspace?.role === 'owner';
  const pendingForMeCount = myInvitesPagination?.total ?? myInvitations.filter((invitation) => invitation.status === 'pending').length;
  const workspaceTotalCount = workspacesPagination?.total ?? workspaces.length;

  const filteredWorkspaces = useMemo(() => {
    const q = workspaceSearch.trim().toLowerCase();
    if (!q) return workspaces;
    return workspaces.filter((workspace) =>
      workspace.name.toLowerCase().includes(q) ||
      (workspace.description || '').toLowerCase().includes(q)
    );
  }, [workspaces, workspaceSearch]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const sorted = [...members].sort((a, b) => {
      if (a.role === 'owner' && b.role !== 'owner') return -1;
      if (a.role !== 'owner' && b.role === 'owner') return 1;
      return a.name.localeCompare(b.name);
    });

    if (!q) return sorted;
    return sorted.filter((member) =>
      member.name.toLowerCase().includes(q) ||
      member.email.toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const filteredInvitations = invitations;

  const ownerMember = members.find((member) => member.role === 'owner');
  const creatorMember = members.find((member) => member.user_id === selectedWorkspace?.owner_id) || ownerMember;
  const ownerCount = members.filter((member) => member.role === 'owner').length;

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

  const loadWorkspaces = async (options: { page?: number; reset?: boolean; append?: boolean } = {}) => {
    if (!token) return [];
    const page = options.page ?? 1;
    const reset = options.reset ?? false;
    const append = options.append ?? false;

    if (append) setLoadingMoreWorkspaces(true);

    try {
      const path = buildPagedPath('/api/workspaces', page, WORKSPACES_LIMIT);
      const res = await apiFetch<{ workspaces: WorkspaceItem[]; pagination?: PaginationMeta }>(path, token);
      const list = res.workspaces || [];
      const pagination = res.pagination || null;
      if (append) {
        setWorkspaces((prev) => mergeById(prev, list));
      } else if (reset) {
        setWorkspaces(list);
      }
      setWorkspacesPagination(pagination);
      setWorkspacesHasMore(Boolean(pagination?.has_next));
      setWorkspacesNextPage((pagination?.page || page) + 1);
      return list;
    } finally {
      if (append) setLoadingMoreWorkspaces(false);
    }
  };

  const loadMyInvitations = async (options: { page?: number; reset?: boolean; append?: boolean } = {}) => {
    if (!token) return;
    const page = options.page ?? 1;
    const reset = options.reset ?? false;
    const append = options.append ?? false;

    if (append) setLoadingMoreMyInvites(true);

    try {
      const path = buildPagedPath('/api/workspaces/invitations/mine', page, MY_INVITES_LIMIT);
      const res = await apiFetch<{ invitations: WorkspaceInvitationItem[]; pagination?: PaginationMeta }>(
        path,
        token
      );
      const list = res.invitations || [];
      const pagination = res.pagination || null;
      if (append) {
        setMyInvitations((prev) => mergeById(prev, list));
      } else if (reset) {
        setMyInvitations(list);
      }
      setMyInvitesPagination(pagination);
      setMyInvitesHasMore(Boolean(pagination?.has_next));
      setMyInvitesNextPage((pagination?.page || page) + 1);
    } catch {
      setMyInvitations([]);
      setMyInvitesPagination(null);
      setMyInvitesHasMore(false);
      setMyInvitesNextPage(2);
    } finally {
      if (append) setLoadingMoreMyInvites(false);
    }
  };

  const loadMembers = async (
    workspaceId: string,
    options: { page?: number; reset?: boolean; append?: boolean } = {}
  ) => {
    if (!token) return;
    const page = options.page ?? 1;
    const reset = options.reset ?? false;
    const append = options.append ?? false;

    if (append) setLoadingMoreMembers(true);

    try {
      const path = buildPagedPath(`/api/workspaces/${workspaceId}/members`, page, MEMBERS_LIMIT);
      const res = await apiFetch<{ members: WorkspaceMemberItem[]; pagination?: PaginationMeta }>(path, token);
      const list = res.members || [];
      const pagination = res.pagination || null;
      if (append) {
        setMembers((prev) => mergeById(prev, list));
      } else if (reset) {
        setMembers(list);
      }
      setMembersPagination(pagination);
      setMembersHasMore(Boolean(pagination?.has_next));
      setMembersNextPage((pagination?.page || page) + 1);
    } finally {
      if (append) setLoadingMoreMembers(false);
    }
  };

  const loadInvitations = async (
    workspaceId: string,
    options: { page?: number; reset?: boolean; append?: boolean } = {}
  ) => {
    if (!token) return;
    const page = options.page ?? 1;
    const reset = options.reset ?? false;
    const append = options.append ?? false;

    if (append) setLoadingMoreInvitations(true);

    try {
      const path = buildPagedPath(`/api/workspaces/${workspaceId}/invitations`, page, INVITATIONS_LIMIT);
      const res = await apiFetch<{ invitations: WorkspaceInvitationItem[]; pagination?: PaginationMeta }>(path, token);
      const list = res.invitations || [];
      const pagination = res.pagination || null;
      if (append) {
        setInvitations((prev) => mergeById(prev, list));
      } else if (reset) {
        setInvitations(list);
      }
      setInvitationsPagination(pagination);
      setInvitationsHasMore(Boolean(pagination?.has_next));
      setInvitationsNextPage((pagination?.page || page) + 1);
    } finally {
      if (append) setLoadingMoreInvitations(false);
    }
  };

  const loadWorkspaceDetails = async (workspaceId: string) => {
    if (!token) return;
    setLoadingDetails(true);
    setError('');

    try {
      await Promise.all([
        loadMembers(workspaceId, { page: 1, reset: true }),
        loadInvitations(workspaceId, { page: 1, reset: true }),
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (!selectedId) {
      setMembers([]);
      setInvitations([]);
      setUpcomingEvents([]);
      setMembersPagination(null);
      setInvitationsPagination(null);
      setUpcomingEventsPagination(null);
      setMembersHasMore(false);
      setInvitationsHasMore(false);
      setUpcomingEventsError('');
      setSelectedUpcomingEvent(null);
      setSelectedUpcomingParticipants([]);
      setShowManageModal(false);
      return;
    }
    loadWorkspaceDetails(selectedId);
  }, [selectedId, token]);

  useEffect(() => {
    if (!selectedId || !token) return;
    loadUpcomingGroupEvents();
  }, [selectedId, token]);

  useEffect(() => {
    if (!token) return;
    loadWorkspaces({ page: 1, reset: true });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadMyInvitations({ page: 1, reset: true });
  }, [token]);

  useEffect(() => {
    selectionRestoredRef.current = false;
    setSelectedId(null);
    setWorkspacesHasMore(false);
    setMyInvitesHasMore(false);
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedId || !selectionStorageKey) return;
    localStorage.setItem(selectionStorageKey, selectedId);
  }, [selectedId, selectionStorageKey]);

  useEffect(() => {
    const workspaceFromUrl = searchParams.get('workspace');
    if (!workspaceFromUrl) return;

    const exists = workspaces.some((workspace) => workspace.id === workspaceFromUrl);
    if (exists) {
      setSelectedId(workspaceFromUrl);
      selectionRestoredRef.current = true;
    }
  }, [searchParams, workspaces]);

  useEffect(() => {
    if (selectionRestoredRef.current || !selectionStorageKey || workspaces.length === 0) return;

    const workspaceFromUrl = searchParams.get('workspace');
    if (workspaceFromUrl) return;

    const storedWorkspaceId = localStorage.getItem(selectionStorageKey);
    const exists = storedWorkspaceId ? workspaces.some((workspace) => workspace.id === storedWorkspaceId) : false;

    if (exists) {
      setSelectedId(storedWorkspaceId);
    }

    selectionRestoredRef.current = true;
  }, [workspaces, searchParams, selectionStorageKey]);

  useEffect(() => {
    if (!selectedId) return;
    const exists = workspaces.some((workspace) => workspace.id === selectedId);
    if (!exists) {
      setSelectedId(null);
    }
  }, [workspaces, selectedId]);

  useEffect(() => {
    setSettingsName(selectedWorkspace?.name || '');
    setSettingsDescription(selectedWorkspace?.description || '');
    setSettingsStatus('idle');
    setSettingsStatusMessage('');
    setDeleteConfirmText('');
    setDeleteError('');
    setInviteError('');
  }, [selectedWorkspace?.id]);

  useEffect(() => {
    setMembersHasMore(false);
    setInvitationsHasMore(false);
  }, [selectedWorkspace?.id]);

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const trimmed = nameInput.trim();
    if (!trimmed) return;

    setCreating(true);
    setError('');

    try {
      const res = await apiFetch<{ workspace: WorkspaceItem }>('/api/workspaces', token, {
        method: 'POST',
        body: JSON.stringify({
          name: trimmed,
          description: descInput.trim() || null,
        }),
      });
      await loadWorkspaces({ page: 1, reset: true });
      setSelectedId(res.workspace.id);
      setNameInput('');
      setDescInput('');
      setShowCreateModal(false);
    } catch (err: any) {
      setError(err.message || 'Could not create workspace.');
    } finally {
      setCreating(false);
    }
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedId || !isOwner) return;

    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      setInviteError('Enter a valid email address.');
      return;
    }

    setInviting(true);
    setInviteError('');

    try {
      const res = await apiFetch<{ invitation: WorkspaceInvitationItem }>(
        `/api/workspaces/${selectedId}/invitations`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ invitee_email: email }),
        }
      );
      setInvitations((prev) => [res.invitation, ...prev]);
      setInviteEmail('');
      await loadMyInvitations({ page: 1, reset: true });
    } catch (err: any) {
      setInviteError(err.message || 'Could not send invitation.');
    } finally {
      setInviting(false);
    }
  };

  const saveWorkspaceSettings = async () => {
    if (!token || !selectedId || !isOwner) return;

    const name = settingsName.trim();
    const description = settingsDescription.trim();

    if (!name) {
      setSettingsStatus('error');
      setSettingsStatusMessage('Workspace title cannot be empty.');
      return;
    }

    setSettingsStatus('saving');
    setSettingsStatusMessage('Saving workspace updates...');
    setError('');

    try {
      const res = await apiFetch<{ workspace: WorkspaceItem }>(`/api/workspaces/${selectedId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ name, description }),
      });
      setWorkspaces((prev) => prev.map((workspace) => (workspace.id === res.workspace.id ? { ...workspace, ...res.workspace } : workspace)));
      setSettingsName(res.workspace.name);
      setSettingsDescription(res.workspace.description || '');
      setSettingsStatus('saved');
      setSettingsStatusMessage('Workspace settings have been updated successfully.');
    } catch (err: any) {
      setSettingsStatus('error');
      setSettingsStatusMessage(err.message || 'Workspace settings could not be updated.');
    }
  };

  useEffect(() => {
    if (!isOwner || !selectedWorkspace?.id) return;

    const currentName = selectedWorkspace.name || '';
    const currentDescription = selectedWorkspace.description || '';
    const nextName = settingsName.trim();
    const nextDescription = settingsDescription.trim();

    if (nextName === currentName && nextDescription === currentDescription) return;

    const timeoutId = window.setTimeout(() => {
      saveWorkspaceSettings();
    }, 550);

    return () => window.clearTimeout(timeoutId);
  }, [settingsName, settingsDescription, selectedWorkspace?.id]);

  const deleteWorkspace = async () => {
    if (!token || !selectedId || !selectedWorkspace || !isOwner) return;
    if (deleteConfirmText.trim() !== selectedWorkspace.name) {
      setDeleteError('Type the exact workspace name to confirm deletion.');
      return;
    }

    setDeletingWorkspace(true);
    setDeleteError('');

    try {
      await apiFetch<{ message: string; workspace_id: string }>(`/api/workspaces/${selectedId}`, token, {
        method: 'DELETE',
      });

      setSelectedId(null);
      await loadWorkspaces({ page: 1, reset: true });

      setMembers([]);
      setInvitations([]);
      setShowManageModal(false);
    } catch (err: any) {
      setDeleteError(err.message || 'Could not delete workspace.');
    } finally {
      setDeletingWorkspace(false);
    }
  };

  const createWorkspaceEvent = async (data: Partial<PlanoraEvent>) => {
    if (!token || !selectedId) return;

    await apiFetch<{ event: PlanoraEvent }>('/api/events', token, {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        workspace_id: selectedId,
      }),
    });

    setShowWorkspaceEventModal(false);
  };

  const handleWorkspaceChatActivity = async () => {
    await loadWorkspaces({ page: 1, reset: true });
  };

  const loadUpcomingGroupEvents = async () => {
    if (!token || !selectedId) return;

    setLoadingUpcomingEvents(true);
    setUpcomingEventsError('');

    try {
      const path = buildPagedPath(`/api/workspaces/${selectedId}/upcoming-events`, 1, UPCOMING_EVENTS_LIMIT);
      const res = await apiFetch<{ events: WorkspaceUpcomingEventItem[]; pagination?: PaginationMeta }>(path, token);
      setUpcomingEvents(res.events || []);
      setUpcomingEventsPagination(res.pagination || null);
    } catch (err: any) {
      setUpcomingEvents([]);
      setUpcomingEventsPagination(null);
      setUpcomingEventsError(err.message || 'Could not load upcoming group events.');
    } finally {
      setLoadingUpcomingEvents(false);
    }
  };

  const loadUpcomingEventParticipants = async (eventId: string) => {
    if (!token) return;

    setLoadingUpcomingParticipants(true);
    try {
      const res = await apiFetch<{ participants: WorkspaceEventParticipantItem[] }>(`/api/events/${eventId}/participants`, token);
      setSelectedUpcomingParticipants(res.participants || []);
    } catch {
      setSelectedUpcomingParticipants([]);
    } finally {
      setLoadingUpcomingParticipants(false);
    }
  };

  const openUpcomingEvent = (event: WorkspaceUpcomingEventItem) => {
    setSelectedUpcomingEvent(event);
    setSelectedUpcomingParticipants([]);
    void loadUpcomingEventParticipants(event.id);
  };

  const closeUpcomingEvent = () => {
    setSelectedUpcomingEvent(null);
    setSelectedUpcomingParticipants([]);
  };

  const updateUpcomingParticipation = async (status: 'accepted' | 'declined') => {
    if (!token || !selectedUpcomingEvent) return;

    const eventId = selectedUpcomingEvent.id;
    setSavingParticipation(true);
    try {
      const res = await apiFetch<{ participant: WorkspaceEventParticipantItem }>(
        `/api/events/${eventId}/participation`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }
      );

      const updatedStatus = res.participant.status;
      setSelectedUpcomingEvent((current) => (current ? { ...current, participant_status: updatedStatus } : current));
      await loadUpcomingEventParticipants(eventId);
      await loadUpcomingGroupEvents();
    } finally {
      setSavingParticipation(false);
    }
  };

    const deleteUpcomingEvent = async (eventId: string) => {
      if (!token) return;
      try {
        await apiFetch(`/api/events/${eventId}`, token, { method: 'DELETE' });
        closeUpcomingEvent();
        await loadUpcomingGroupEvents();
      } catch (err) {
        throw err;
      }
    };

  const loadWorkspaceSharedNotes = async (
    options: { page?: number; reset?: boolean; append?: boolean } = {}
  ) => {
    if (!token || !selectedId) return;
    const page = options.page ?? 1;
    const reset = options.reset ?? false;
    const append = options.append ?? false;

    if (append) setLoadingMoreSharedNotes(true);
    else setLoadingSharedNotes(true);
    setSharedNotesError('');

    try {
      const path = buildPagedPath(`/api/workspaces/${selectedId}/shared-notes`, page, SHARED_NOTES_LIMIT);
      const res = await apiFetch<{ notes: WorkspaceSharedNoteItem[]; pagination?: PaginationMeta }>(path, token);
      const list = res.notes || [];
      const pagination = res.pagination || null;
      if (append) {
        setSharedNotes((prev) => mergeById(prev, list));
      } else if (reset) {
        setSharedNotes(list);
      }
      setSharedNotesPagination(pagination);
      setSharedNotesHasMore(Boolean(pagination?.has_next));
      setSharedNotesNextPage((pagination?.page || page) + 1);
    } catch (err: any) {
      setSharedNotes([]);
      setSharedNotesPagination(null);
      setSharedNotesHasMore(false);
      setSharedNotesNextPage(2);
      setSharedNotesError(err.message || 'Could not load shared notes.');
    } finally {
      if (append) setLoadingMoreSharedNotes(false);
      else setLoadingSharedNotes(false);
    }
  };

  const openSharedNotesModal = () => {
    setShowSharedNotesModal(true);
  };

  useEffect(() => {
    if (!showSharedNotesModal || !selectedId || !token) return;
    loadWorkspaceSharedNotes({ page: 1, reset: true });
  }, [showSharedNotesModal, selectedId, token]);

  const navigateToNote = (noteId: string) => {
    setShowSharedNotesModal(false);
    router.push(`/notes?note=${noteId}`);
  };

  const leaveWorkspace = async () => {
    if (!token || !selectedId || isOwner) return;

    setLeavingWorkspace(true);
    setError('');

    try {
      await apiFetch<{ message: string; workspace_id: string }>(`/api/workspaces/${selectedId}/leave`, token, {
        method: 'DELETE',
      });

      setSelectedId(null);
      await loadWorkspaces({ page: 1, reset: true });

      setMembers([]);
      setInvitations([]);
      setShowManageModal(false);
    } catch (err: any) {
      setError(err.message || 'Could not leave workspace.');
    } finally {
      setLeavingWorkspace(false);
    }
  };

  const respondToInvitation = async (invitationId: string, action: 'accepted' | 'declined') => {
    if (!token) return;
    setRespondingId(invitationId);
    setError('');

    try {
      const res = await apiFetch<{ invitation: WorkspaceInvitationItem }>(
        `/api/workspaces/invitations/${invitationId}/respond`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ action }),
        }
      );

      setMyInvitations((prev) => prev.filter((invitation) => invitation.id !== invitationId));

      if (action === 'accepted') {
        await loadWorkspaces({ page: 1, reset: true });
      }

      if (selectedId && res.invitation.workspace_id === selectedId) {
        loadWorkspaceDetails(selectedId);
      }
    } catch (err: any) {
      setError(err.message || 'Could not respond to invitation.');
    } finally {
      setRespondingId(null);
    }
  };

  const cancelSentInvitation = async (invitationId: string) => {
    if (!token) return;
    setCancellingInviteId(invitationId);
    setError('');

    try {
      await apiFetch<{ message: string; invitation_id: string }>(
        `/api/workspaces/invitations/${invitationId}`,
        token,
        { method: 'DELETE' }
      );
      setInvitations((prev) => prev.filter((invitation) => invitation.id !== invitationId));
      await loadMyInvitations({ page: 1, reset: true });
    } catch (err: any) {
      setError(err.message || 'Could not cancel invitation.');
    } finally {
      setCancellingInviteId(null);
    }
  };

  const removeMember = async (memberUserId: string) => {
    if (!token || !selectedId || !isOwner) return;
    setRemovingMemberId(memberUserId);
    setError('');

    try {
      await apiFetch<{ message: string }>(`/api/workspaces/${selectedId}/members/${memberUserId}`, token, {
        method: 'DELETE',
      });
      setMembers((prev) => prev.filter((member) => member.user_id !== memberUserId));
      await loadWorkspaces({ page: 1, reset: true });
    } catch (err: any) {
      setError(err.message || 'Could not remove member.');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const assignOwner = async (memberUserId: string) => {
    if (!token || !selectedId || !isOwner) return;
    setAssigningOwnerId(memberUserId);
    setError('');

    try {
      await apiFetch<{ message: string }>(`/api/workspaces/${selectedId}/members/${memberUserId}/owner`, token, {
        method: 'POST',
      });
      await loadWorkspaceDetails(selectedId);
      await loadWorkspaces({ page: 1, reset: true });
    } catch (err: any) {
      setError(err.message || 'Could not assign ownership.');
    } finally {
      setAssigningOwnerId(null);
    }
  };

  const removeOwnerRole = async (memberUserId: string) => {
    if (!token || !selectedId || !isOwner) return;
    setRemovingOwnerId(memberUserId);
    setError('');

    try {
      await apiFetch<{ message: string }>(`/api/workspaces/${selectedId}/members/${memberUserId}/member`, token, {
        method: 'POST',
      });
      await loadWorkspaceDetails(selectedId);
      await loadWorkspaces({ page: 1, reset: true });
    } catch (err: any) {
      setError(err.message || 'Could not remove ownership.');
    } finally {
      setRemovingOwnerId(null);
    }
  };

  const loadMoreWorkspaces = async () => {
    if (!workspacesHasMore || loadingMoreWorkspaces) return;
    await loadWorkspaces({ page: workspacesNextPage, append: true });
  };

  const loadMoreMyInvitations = async () => {
    if (!myInvitesHasMore || loadingMoreMyInvites) return;
    await loadMyInvitations({ page: myInvitesNextPage, append: true });
  };

  const loadMoreMembers = async () => {
    if (!selectedId || !membersHasMore || loadingMoreMembers || loadingDetails) return;
    await loadMembers(selectedId, { page: membersNextPage, append: true });
  };

  const loadMoreInvitations = async () => {
    if (!selectedId || !invitationsHasMore || loadingMoreInvitations || loadingDetails) return;
    await loadInvitations(selectedId, { page: invitationsNextPage, append: true });
  };

  const loadMoreSharedNotes = async () => {
    if (!sharedNotesHasMore || loadingMoreSharedNotes || loadingSharedNotes) return;
    await loadWorkspaceSharedNotes({ page: sharedNotesNextPage, append: true });
  };

  const isNearBottom = (element: HTMLDivElement, threshold = 120) => (
    element.scrollTop + element.clientHeight >= element.scrollHeight - threshold
  );

  const handleWorkspacesScroll = (event: UIEvent<HTMLDivElement>) => {
    if (isNearBottom(event.currentTarget)) {
      void loadMoreWorkspaces();
    }
  };

  const handleMyInvitationsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (isNearBottom(event.currentTarget)) {
      void loadMoreMyInvitations();
    }
  };

  const handleMembersScroll = (event: UIEvent<HTMLDivElement>) => {
    if (isNearBottom(event.currentTarget)) {
      void loadMoreMembers();
    }
  };

  const handleInvitationsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (isNearBottom(event.currentTarget)) {
      void loadMoreInvitations();
    }
  };

  const handleSharedNotesScroll = (event: UIEvent<HTMLDivElement>) => {
    if (isNearBottom(event.currentTarget)) {
      void loadMoreSharedNotes();
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[330px_minmax(0,1fr)] gap-5 min-h-0 xl:h-full overflow-visible xl:overflow-hidden">
        <aside className="rounded-[28px] border border-[var(--border)] bg-[var(--card)]/96 p-4 flex flex-col gap-4 shadow-[0_14px_34px_rgba(9,25,48,0.09)] min-h-0 overflow-visible xl:overflow-hidden">
          <div className="rounded-3xl border border-[#cf9569] bg-gradient-to-br from-[#b85709] to-[#9f4706] text-white p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] opacity-80">Collaboration</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{workspaceTotalCount}</p>
            <p className="text-xs mt-1 opacity-80">Active workspaces in your hub</p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="h-11 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium"
          >
            Create workspace
          </button>

          <button
            onClick={() => setShowMyInvitationsModal(true)}
            className="h-10 px-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-sm inline-flex items-center justify-center gap-1.5"
          >
            <MailPlus className="h-4 w-4" /> My invites ({pendingForMeCount})
          </button>

          <div className="rounded-3xl border border-[var(--border)] bg-[var(--muted)]/45 p-2 flex-1 flex flex-col min-h-0">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted-foreground)] px-2 pb-2">Your workspaces</p>
            <div className="px-2 pb-2">
              <div className="h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <input
                  value={workspaceSearch}
                  onChange={(e) => setWorkspaceSearch(e.target.value)}
                  placeholder="Search workspaces"
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>
            </div>
            <div onScroll={handleWorkspacesScroll} className="compact-scrollbar workspace-sidebar-scroll space-y-1 flex-1 min-h-0 overflow-y-auto pr-2">
              {filteredWorkspaces.length === 0 && <p className="text-xs text-[var(--muted-foreground)] px-2 py-2">No matching workspace.</p>}
              {filteredWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => setSelectedId(workspace.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-2xl border transition-colors ${selectedId === workspace.id ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-transparent hover:bg-[var(--muted)]'}`}
                >
                  <p className="text-sm font-semibold truncate">{workspace.name}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    {workspace.member_count} members · {workspace.role}
                  </p>
                </button>
              ))}
              {loadingMoreWorkspaces && <p className="text-xs text-[var(--muted-foreground)] px-2 py-2">Loading more workspaces...</p>}
            </div>
          </div>
        </aside>

        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--card)]/96 p-4 sm:p-5 shadow-[0_12px_32px_rgba(9,25,48,0.09)] flex flex-col gap-4 min-h-[460px] xl:min-h-0 overflow-hidden">
          {!selectedWorkspace && (
            <div className="h-full rounded-3xl border border-[var(--border)] bg-[var(--muted)]/40 flex items-center justify-center text-sm text-[var(--muted-foreground)]">
              Select or create a workspace to open collaboration controls.
            </div>
          )}

          {selectedWorkspace && (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 flex-1 min-h-0 overflow-hidden">
              <WorkspaceChatPanel
                workspaceId={selectedWorkspace.id}
                workspaceName={selectedWorkspace.name}
                onMessageSent={handleWorkspaceChatActivity}
              />

              <div className="rounded-3xl border border-[var(--border)] bg-[var(--muted)]/40 p-4 flex flex-col gap-3 min-h-0 overflow-hidden">
                <h3 className="text-sm font-semibold">Quick summary</h3>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
                  <p className="text-xs text-[var(--muted-foreground)]">Role</p>
                  <p className="text-sm font-medium capitalize">{selectedWorkspace.role}</p>
                </div>
                <button
                  onClick={() => setShowMembersModal(true)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-left hover:bg-[var(--muted)]/40 transition-colors"
                >
                  <p className="text-xs text-[var(--muted-foreground)]">Members</p>
                  <p className="text-sm font-medium">{selectedWorkspace.member_count}</p>
                </button>
                <button
                  onClick={() => setShowManageModal(true)}
                  className="h-10 px-4 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm inline-flex items-center justify-center gap-1.5"
                >
                  <Settings2 className="h-4 w-4" /> Manage workspace
                </button>
                <button
                  onClick={() => setShowWorkspaceEventModal(true)}
                  className="h-10 px-4 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm inline-flex items-center justify-center gap-1.5"
                >
                  <Clock3 className="h-4 w-4" /> Create group event
                </button>
                <button
                  onClick={openSharedNotesModal}
                  className="h-10 px-4 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm inline-flex items-center justify-center gap-1.5"
                >
                  <FileText className="h-4 w-4" /> Shared notes
                </button>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-[var(--muted-foreground)]">Upcoming group events</p>
                    </div>
                    {loadingUpcomingEvents && <span className="text-[11px] text-[var(--muted-foreground)]">Loading...</span>}
                  </div>

                  <div className="space-y-2 overflow-y-auto pr-1 compact-scrollbar min-h-0">
                    {!loadingUpcomingEvents && upcomingEventsError && (
                      <p className="text-xs text-[var(--destructive)]">{upcomingEventsError}</p>
                    )}
                    {!loadingUpcomingEvents && !upcomingEventsError && upcomingEvents.length === 0 && (
                      <p className="text-xs text-[var(--muted-foreground)]">No upcoming group events yet.</p>
                    )}
                    {!loadingUpcomingEvents && upcomingEvents.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => openUpcomingEvent(event)}
                        className="w-full text-left rounded-xl border border-[var(--border)] bg-[var(--muted)]/35 px-3 py-2.5 hover:bg-[var(--muted)]/60 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{event.title}</p>
                            <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                              {format(new Date(event.start_time), 'd MMM, p')}
                            </p>
                          </div>
                          <span className="text-[11px] text-[var(--muted-foreground)] whitespace-nowrap">
                            {event.not_joining_count} not joining
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--muted-foreground)] mt-1">
                          By {event.creator_name}
                          {event.participant_status === 'declined' ? ' · hidden by you' : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
        </section>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-40 bg-[#0f172acc]/65 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-[0_28px_70px_rgba(2,8,23,0.35)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold">Create workspace</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="h-9 w-9 rounded-xl border border-[var(--border)] inline-flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={createWorkspace} className="flex flex-col gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Workspace name"
                className="h-11 px-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <textarea
                value={descInput}
                onChange={(e) => setDescInput(e.target.value)}
                placeholder="Short description"
                rows={3}
                className="px-3 py-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-sm resize-none outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <button
                disabled={creating}
                className="h-11 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showMyInvitationsModal && (
        <div className="fixed inset-0 z-40 bg-[#0f172acc]/65 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-[0_28px_70px_rgba(2,8,23,0.35)] flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold">Pending invitations for you</h2>
              <button
                onClick={() => setShowMyInvitationsModal(false)}
                className="h-9 w-9 rounded-xl border border-[var(--border)] inline-flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div onScroll={handleMyInvitationsScroll} className="space-y-2 overflow-y-auto pr-1">
              {myInvitations.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No pending invitations.</p>}
              {myInvitations.map((invitation) => (
                <div key={invitation.id} className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/40 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{invitation.workspace_name || 'Workspace'}</p>
                    <p className="text-xs text-[var(--muted-foreground)] inline-flex items-center gap-1.5">
                      <Clock3 className="h-3 w-3" />
                      Invited by {invitation.inviter_name || 'a teammate'} · {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => respondToInvitation(invitation.id, 'accepted')}
                      disabled={respondingId === invitation.id}
                      className="h-9 px-3 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondToInvitation(invitation.id, 'declined')}
                      disabled={respondingId === invitation.id}
                      className="h-9 px-3 rounded-lg border border-[var(--border)] text-xs disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
              {loadingMoreMyInvites && <p className="text-sm text-[var(--muted-foreground)]">Loading more invitations...</p>}
            </div>
          </div>
        </div>
      )}

      {showSharedNotesModal && selectedWorkspace && (
        <div className="fixed inset-0 z-40 bg-[#0f172acc]/65 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-[0_28px_70px_rgba(2,8,23,0.35)] flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold">Shared notes in {selectedWorkspace.name}</h2>
              <button
                onClick={() => setShowSharedNotesModal(false)}
                className="h-9 w-9 rounded-xl border border-[var(--border)] inline-flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div onScroll={handleSharedNotesScroll} className="space-y-2 overflow-y-auto pr-1">
              {loadingSharedNotes && <p className="text-sm text-[var(--muted-foreground)]">Loading shared notes...</p>}
              {!loadingSharedNotes && sharedNotesError && <p className="text-sm text-[var(--destructive)]">{sharedNotesError}</p>}
              {!loadingSharedNotes && !sharedNotesError && sharedNotes.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">No notes have been shared with this collaboration group yet.</p>
              )}

              {!loadingSharedNotes && sharedNotes.map((note) => (
                <button
                  key={note.id}
                  onClick={() => navigateToNote(note.id)}
                  className="w-full text-left rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-3 hover:bg-[var(--muted)]/55 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{note.title?.trim() || 'Untitled'}</p>
                    </div>
                    <span className="text-xs text-[var(--muted-foreground)] capitalize">{note.access_permission}</span>
                  </div>
                  <p className="text-[11px] text-[var(--muted-foreground)] mt-2">
                    Shared by {note.owner_name} · {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                  </p>
                </button>
              ))}
              {loadingMoreSharedNotes && <p className="text-sm text-[var(--muted-foreground)]">Loading more shared notes...</p>}
            </div>
          </div>
        </div>
      )}

      {showMembersModal && selectedWorkspace && (
        <div className="fixed inset-0 z-40 bg-[#0f172acc]/65 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-[0_28px_70px_rgba(2,8,23,0.35)] flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold">Members in {selectedWorkspace.name}</h2>
              <button
                onClick={() => setShowMembersModal(false)}
                className="h-9 w-9 rounded-xl border border-[var(--border)] inline-flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div onScroll={handleMembersScroll} className="space-y-2 overflow-y-auto pr-1 max-h-[65vh]">
              {loadingDetails && <p className="text-sm text-[var(--muted-foreground)]">Loading members...</p>}
              {!loadingDetails && filteredMembers.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)]">No members found.</p>
              )}
              {!loadingDetails && filteredMembers.map((member) => (
                <div key={member.id} className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{member.name}</p>
                    <span className="text-xs capitalize text-[var(--muted-foreground)]">{member.role}</span>
                  </div>
                </div>
              ))}
              {loadingMoreMembers && <p className="text-sm text-[var(--muted-foreground)]">Loading more members...</p>}
            </div>
          </div>
        </div>
      )}

      <WorkspaceEventDetailModal
        event={selectedUpcomingEvent}
        participants={selectedUpcomingParticipants}
        saving={savingParticipation || loadingUpcomingParticipants}
        onClose={closeUpcomingEvent}
        onToggleParticipation={updateUpcomingParticipation}
         canDelete={isOwner || selectedUpcomingEvent?.user_id === currentUserId}
         onDelete={deleteUpcomingEvent}
      />

      <EventModal
        open={showWorkspaceEventModal}
        onClose={() => setShowWorkspaceEventModal(false)}
        onSave={createWorkspaceEvent}
        defaultStart={new Date()}
      />

      {showManageModal && selectedWorkspace && (
        <div className="fixed inset-0 z-[60] bg-[#0f172acc]/65 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-[0_28px_70px_rgba(2,8,23,0.35)] flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Manage {selectedWorkspace.name}</h2>
                <p className="text-xs text-[var(--muted-foreground)]">Invites, members, workspace settings, and deletion controls.</p>
              </div>
              <button
                onClick={() => setShowManageModal(false)}
                className="h-9 w-9 rounded-xl border border-[var(--border)] inline-flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto pr-1">
              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Workspace info</p>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                  <p className="text-xs text-[var(--muted-foreground)]">Created by</p>
                  <p className="text-sm font-medium mt-0.5">
                    {creatorMember?.name || 'Unknown user'}
                    <span className="text-xs font-normal text-[var(--muted-foreground)]"> · {creatorMember?.email || 'No email available'}</span>
                  </p>

                  <p className="text-xs text-[var(--muted-foreground)] mt-3">Created on</p>
                  <p className="text-sm font-medium mt-0.5">{format(new Date(selectedWorkspace.created_at), 'd MMMM yyyy')}</p>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Workspace settings</p>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                  {!isOwner && (
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Only workspace owners can edit settings.
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      placeholder="Workspace title"
                      className="h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm"
                      disabled={!isOwner}
                    />
                    <textarea
                      value={settingsDescription}
                      onChange={(e) => setSettingsDescription(e.target.value)}
                      placeholder="Workspace description"
                      rows={2}
                      className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm resize-none"
                      disabled={!isOwner}
                    />
                    {isOwner && settingsStatusMessage && (
                      <p className={`text-xs ${settingsStatus === 'error' ? 'text-[var(--destructive)]' : 'text-[var(--muted-foreground)]'}`}>
                        {settingsStatusMessage}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Members</p>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4 min-h-[220px] max-h-[50vh] flex flex-col">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Members</h3>
                    <div className="h-8 px-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] flex items-center gap-2 w-[180px]">
                      <Search className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      <input
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search"
                        className="w-full bg-transparent text-xs outline-none"
                      />
                    </div>
                  </div>
                  <div onScroll={handleMembersScroll} className="space-y-2 overflow-y-auto pr-1">
                    {loadingDetails && <p className="text-xs text-[var(--muted-foreground)]">Loading...</p>}
                    {!loadingDetails && filteredMembers.length === 0 && <p className="text-xs text-[var(--muted-foreground)]">No members found.</p>}
                    {filteredMembers.map((member) => (
                      <div key={member.id} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{member.name}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">{member.email} · {member.role}</p>
                          </div>
                          {isOwner && member.user_id !== currentUserId && member.role !== 'owner' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => assignOwner(member.user_id)}
                                disabled={assigningOwnerId === member.user_id}
                                className="h-8 px-2.5 rounded-lg border border-[var(--border)] text-xs disabled:opacity-50"
                              >
                                {assigningOwnerId === member.user_id ? 'Assigning...' : 'Make owner'}
                              </button>
                              <button
                                onClick={() => removeMember(member.user_id)}
                                disabled={removingMemberId === member.user_id}
                                className="h-8 px-2.5 rounded-lg border border-[var(--destructive)]/35 text-[var(--destructive)] text-xs disabled:opacity-50"
                              >
                                {removingMemberId === member.user_id ? 'Removing...' : 'Remove'}
                              </button>
                            </div>
                          )}
                          {isOwner && member.user_id !== currentUserId && member.role === 'owner' && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => removeOwnerRole(member.user_id)}
                                disabled={removingOwnerId === member.user_id || ownerCount <= 1}
                                className="h-8 px-2.5 rounded-lg border border-[var(--border)] text-xs disabled:opacity-50"
                              >
                                {removingOwnerId === member.user_id ? 'Removing...' : 'Remove ownership'}
                              </button>
                              <button
                                onClick={() => removeMember(member.user_id)}
                                disabled={removingMemberId === member.user_id || ownerCount <= 1}
                                className="h-8 px-2.5 rounded-lg border border-[var(--destructive)]/35 text-[var(--destructive)] text-xs disabled:opacity-50"
                              >
                                {removingMemberId === member.user_id ? 'Removing...' : 'Remove member'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {loadingMoreMembers && <p className="text-xs text-[var(--muted-foreground)]">Loading more members...</p>}
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Invitations</p>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                  {!isOwner && (
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Only workspace owners can invite members.
                    </p>
                  )}
                  <form onSubmit={sendInvite} className="flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Invite by email"
                        className="h-11 px-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-sm flex-1 outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        disabled={!isOwner}
                      />
                      <button
                        disabled={inviting || !isOwner}
                        className="h-11 px-4 rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60"
                      >
                        {inviting ? 'Sending...' : 'Send invite'}
                      </button>
                    </div>
                    {inviteError && <p className="text-xs text-[var(--destructive)]">{inviteError}</p>}
                  </form>

                  <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-semibold">Pending invitations</p>
                    </div>

                    <div onScroll={handleInvitationsScroll} className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {loadingDetails && <p className="text-xs text-[var(--muted-foreground)]">Loading...</p>}
                      {!loadingDetails && filteredInvitations.length === 0 && (
                        <p className="text-xs text-[var(--muted-foreground)]">No pending invitations.</p>
                      )}
                      {filteredInvitations.map((invitation) => (
                        <div key={invitation.id} className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{invitation.invitee_email}</p>
                              <p className="text-xs text-[var(--muted-foreground)]">
                                Sent {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true })}
                              </p>
                            </div>
                            {invitation.inviter_id === currentUserId && (
                              <button
                                onClick={() => cancelSentInvitation(invitation.id)}
                                disabled={cancellingInviteId === invitation.id}
                                className="h-8 px-2.5 rounded-lg border border-[var(--destructive)]/35 text-[var(--destructive)] text-xs disabled:opacity-50"
                              >
                                {cancellingInviteId === invitation.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {loadingMoreInvitations && <p className="text-xs text-[var(--muted-foreground)]">Loading more invitations...</p>}
                    </div>
                  </div>
                </div>
              </section>

              {isOwner ? (
                <section className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Delete workspace</p>
                  <div className="rounded-2xl border border-[var(--destructive)]/35 bg-[var(--destructive)]/10 p-4">
                    <div className="flex items-center gap-2 mb-2 text-[var(--destructive)]">
                      <Trash2 className="h-4 w-4" />
                      <h3 className="text-sm font-semibold">Workspace removal</h3>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Deleting a workspace is permanent. Type workspace name to confirm.
                    </p>
                    <input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder={selectedWorkspace.name}
                      className="h-10 px-3 rounded-xl border border-[var(--destructive)]/35 bg-[var(--card)] text-sm w-full mb-2"
                    />
                    <button
                      onClick={deleteWorkspace}
                      disabled={deletingWorkspace}
                      className="h-10 px-4 rounded-xl bg-[var(--destructive)] text-white text-sm font-medium disabled:opacity-60"
                    >
                      {deletingWorkspace ? 'Deleting...' : 'Delete workspace'}
                    </button>
                    {deleteError && <p className="text-xs text-[var(--destructive)] mt-2">{deleteError}</p>}
                  </div>
                </section>
              ) : (
                <section className="space-y-2">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Leave workspace</p>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-4">
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      You will stop receiving workspace chat, events, and notifications for this group.
                    </p>
                    <button
                      onClick={leaveWorkspace}
                      disabled={leavingWorkspace}
                      className="h-10 px-4 rounded-xl border border-[var(--destructive)]/35 text-[var(--destructive)] text-sm font-medium disabled:opacity-60"
                    >
                      {leavingWorkspace ? 'Leaving...' : 'Leave workspace'}
                    </button>
                  </div>
                </section>
              )}
            </div>
            </div>
          </div>
      )}
    </>
  );
}
