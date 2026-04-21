'use client';

import { useEffect, useState } from 'react';
import { PlanoraEvent } from '@/types/event';
import { format } from 'date-fns';
import { EventCategoryOption, getDefaultEventCategories, loadUserEventCategories, resolveEventCategory } from '@/lib/eventCategories';

interface Props {
  event: PlanoraEvent | null;
  onClose: () => void;
  onEdit: (event: PlanoraEvent) => void;
  onDelete: (id: string, scope: 'single' | 'series') => Promise<void>;
  onToggleVisibility?: (event: PlanoraEvent, status: 'accepted' | 'declined') => Promise<void>;
}

const SOURCE_LABEL: Record<string, string> = {
  planora: 'Planora',
  google: 'Google Calendar',
  outlook: 'Outlook',
  apple: 'Apple Calendar',
  imported: 'Imported',
};

export default function EventDetailModal({
  event,
  onClose,
  onEdit,
  onDelete,
  onToggleVisibility,
}: Props) {
  const [showDeleteScopeChoice, setShowDeleteScopeChoice] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<EventCategoryOption[]>(getDefaultEventCategories());

  useEffect(() => {
    const applyCategories = () => setCategoryOptions(loadUserEventCategories());
    applyCategories();
    window.addEventListener('planora-event-categories-changed', applyCategories);
    return () => {
      window.removeEventListener('planora-event-categories-changed', applyCategories);
    };
  }, []);

  if (!event) return null;

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const category = resolveEventCategory(event.event_type, event.color, categoryOptions);

  const formatTime = (d: Date) =>
    event.is_all_day
      ? format(d, 'MMM d, yyyy')
      : format(d, 'MMM d, yyyy · HH:mm');

  const recurrenceLabel = event.recurrence_rule && event.recurrence_rule !== 'none'
    ? `Repeats ${event.recurrence_interval || 1} ${event.recurrence_rule}${(event.recurrence_interval || 1) > 1 ? 's' : ''}`
    : null;

  const isRecurringSeries = !event.is_imported && (event.recurrence_rule !== 'none' || !!event.recurrence_parent_id);
  const isGroupEvent = Boolean(event.workspace_id);
  const isHidden = event.participant_status === 'declined';
  const canEdit = event.can_edit ?? true;
  const canDelete = event.can_delete ?? true;

  const handleDelete = async () => {
    if (isRecurringSeries) {
      setShowDeleteScopeChoice(true);
      return;
    }
    await onDelete(event.id, 'single');
    onClose();
  };

  const handleEdit = () => {
    onEdit(event);
    onClose();
  };

  const handleScopedDelete = async (scope: 'single' | 'series') => {
    await onDelete(event.id, scope);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-3 h-3 rounded-sm mt-1.5 flex-shrink-0" style={{ background: category.color }} />
          <div className="flex-1">
            <h2 className="font-semibold text-lg leading-tight">{event.title}</h2>
            {event.is_imported && (
              <span className="text-xs text-[var(--muted-foreground)] bg-[var(--muted)] px-2 py-0.5 rounded-full mt-1 inline-block">
                {SOURCE_LABEL[event.source] || 'Imported'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none flex-shrink-0">×</button>
        </div>

        <div className="flex flex-col gap-2 text-sm text-[var(--muted-foreground)]">
          <div className="flex gap-2">
            <span className="w-12 mt-0.5">Time</span>
            <span>{formatTime(start)} → {formatTime(end)}</span>
          </div>
          <div className="flex gap-2">
            <span className="w-12 mt-0.5">Tag</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: category.color }} />
              {category.label}
            </span>
          </div>
          {event.location && (
            <div className="flex gap-2">
              <span className="w-12">Link</span>
              <a href={event.location} target="_blank" rel="noreferrer" className="underline break-all">
                {event.location}
              </a>
            </div>
          )}
          {event.description && (
            <div className="flex gap-2">
              <span className="w-12">Note</span>
              <span className="whitespace-pre-wrap">{event.description}</span>
            </div>
          )}
          {recurrenceLabel && (
            <div className="flex gap-2">
              <span className="w-12">Repeat</span>
              <span>
                {recurrenceLabel}
                {event.recurrence_until ? ` · until ${format(new Date(event.recurrence_until), 'MMM d, yyyy')}` : ' · ongoing'}
              </span>
            </div>
          )}
          {isRecurringSeries && (
            <div className="mt-1 space-y-1">
              <p className="text-xs text-[var(--muted-foreground)]">
                Editing this event updates only this occurrence and will not affect future recurring events.
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                When you press delete, you can choose to remove only this event or all recurring events.
              </p>
            </div>
          )}

          {isGroupEvent && (
            <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--background)]/70 p-2.5">
              <p className="text-xs text-[var(--muted-foreground)] mb-2">
                {isHidden ? 'This group event is hidden from your calendar.' : 'This group event is visible on your calendar.'}
              </p>
              <button
                onClick={async () => {
                  if (!onToggleVisibility) return;
                  await onToggleVisibility(event, isHidden ? 'accepted' : 'declined');
                  onClose();
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
              >
                {isHidden ? 'Show on my calendar' : 'Hide from my calendar'}
              </button>
            </div>
          )}
        </div>

        {showDeleteScopeChoice && isRecurringSeries && (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--background)]/80 p-2.5">
            <p className="text-sm font-medium mb-2">Delete recurring event</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={() => handleScopedDelete('single')}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
              >
                This event only
              </button>
              <button
                onClick={() => handleScopedDelete('series')}
                className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
              >
                All recurring events
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          {!event.is_imported && (canEdit || canDelete) && (
            <>
              {isRecurringSeries ? (
                <>
                  {canEdit && (
                    <button
                      onClick={handleEdit}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--destructive)]/40 text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </>
              ) : (
                <>
                  {canEdit && (
                    <button
                      onClick={handleEdit}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--destructive)]/40 text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {event.is_imported && canDelete && (
            <button
              onClick={handleDelete}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--destructive)]/40 text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors"
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
