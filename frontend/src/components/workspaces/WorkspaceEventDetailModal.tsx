'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { WorkspaceEventParticipantItem, WorkspaceUpcomingEventItem } from '@/types/workspace';

interface Props {
  event: WorkspaceUpcomingEventItem | null;
  participants: WorkspaceEventParticipantItem[];
  saving: boolean;
  canDelete: boolean;
  onClose: () => void;
  onToggleParticipation: (status: 'accepted' | 'declined') => void;
  onDelete?: (eventId: string) => Promise<void>;
}

export default function WorkspaceEventDetailModal({
  event,
  participants,
  saving,
  canDelete,
  onClose,
  onToggleParticipation,
  onDelete,
}: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  if (!event) return null;

  const declinedParticipants = participants.filter((participant) => participant.status === 'declined');
  const isHidden = event.participant_status === 'declined';
  const toggleLabel = isHidden ? 'Show on my calendar' : 'Hide from my calendar';
  const toggleStatus: 'accepted' | 'declined' = isHidden ? 'accepted' : 'declined';

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete(event.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete event.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[#0f172acc]/65 backdrop-blur-sm p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-[0_28px_70px_rgba(2,8,23,0.35)] flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{event.title}</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              {format(new Date(event.start_time), 'd MMM yyyy, p')} - {format(new Date(event.end_time), 'p')}
            </p>
            {event.location && <p className="text-sm text-[var(--muted-foreground)] mt-1">{event.location}</p>}
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-[var(--border)] inline-flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {event.description && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Details</p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--muted)]/35 p-3 min-h-0 overflow-hidden flex flex-col">
          <p className="text-sm font-semibold mb-2">Not joining ({declinedParticipants.length})</p>
          <div className="space-y-2 overflow-y-auto pr-1 compact-scrollbar max-h-[280px]">
            {declinedParticipants.length === 0 && <p className="text-xs text-[var(--muted-foreground)]">Nobody has opted out yet.</p>}
            {declinedParticipants.map((participant) => (
              <div key={participant.user_id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <p className="text-sm font-medium">{participant.name}</p>
                <p className="text-xs text-[var(--muted-foreground)]">{participant.email}</p>
              </div>
            ))}
          </div>
        </section>

        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggleParticipation(toggleStatus)}
              disabled={saving || deleting}
              className="h-10 px-4 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60"
            >
              {saving ? 'Saving...' : toggleLabel}
            </button>
            <span className="text-xs text-[var(--muted-foreground)]">
              {isHidden ? 'Hidden from your calendar' : 'Visible on your calendar'}
            </span>
          </div>
          {canDelete && onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="h-10 px-4 rounded-xl bg-[var(--destructive)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {deleting ? 'Deleting...' : 'Delete event'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
