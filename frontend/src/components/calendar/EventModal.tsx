'use client';

import { useState, useEffect, useRef } from 'react';
import { CalendarDays, Clock3, Repeat } from 'lucide-react';
import DatePicker from 'react-datepicker';
import { PlanoraEvent } from '@/types/event';
import {
  EventCategoryOption,
  getDefaultEventCategories,
  loadUserEventCategories,
  normalizeEventType,
  resolveEventCategory,
} from '@/lib/eventCategories';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<PlanoraEvent>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onDecline?: (id: string) => Promise<void>;
  initial?: PlanoraEvent | null;
  defaultStart?: Date;
}

const RECURRENCE_OPTIONS: Array<{ value: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'; label: string }> = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

function toDateTimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDefaultLocal(date: Date, addHours = 0) {
  const d = new Date(date.getTime() + addHours * 3600000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDateToLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDatePart(value: string) {
  return value.slice(0, 10);
}

function getTimePart(value: string) {
  return value.slice(11, 16);
}

function toTimeDraft(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTimeDraft(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (isValid24HourTime(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 1 || digits.length === 2) {
    const hour = Number(digits);
    if (!Number.isFinite(hour) || hour > 23) return null;
    return `${String(hour).padStart(2, '0')}:00`;
  }
  if (digits.length === 3) {
    const hour = Number(digits.slice(0, 1));
    const minute = Number(digits.slice(1));
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  if (digits.length === 4) {
    const hour = Number(digits.slice(0, 2));
    const minute = Number(digits.slice(2));
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  return null;
}

function isValid24HourTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export default function EventModal({ open, onClose, onSave, onDelete, onDecline, initial, defaultStart }: Props) {
  const now = defaultStart || new Date();
  const endTimeInputRef = useRef<HTMLInputElement | null>(null);

  const [categoryOptions, setCategoryOptions] = useState<EventCategoryOption[]>(getDefaultEventCategories());
  const [title, setTitle]           = useState('');
  const [description, setDesc]      = useState('');
  const [startTime, setStart]       = useState(toDefaultLocal(now));
  const [endTime, setEnd]           = useState(toDefaultLocal(now, 1));
  const [startTimeDraft, setStartTimeDraft] = useState(getTimePart(toDefaultLocal(now)));
  const [endTimeDraft, setEndTimeDraft] = useState(getTimePart(toDefaultLocal(now, 1)));
  const [eventType, setEventType]   = useState<string>('personal');
  const [color, setColor]           = useState(getDefaultEventCategories()[0].color);
  const [isAllDay, setAllDay]       = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [recurrenceUntil, setRecurrenceUntil] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [deleting, setDeleting]     = useState(false);
  const [declining, setDeclining]   = useState(false);

  useEffect(() => {
    const applyCategories = () => {
      setCategoryOptions(loadUserEventCategories());
    };

    applyCategories();
    window.addEventListener('planora-event-categories-changed', applyCategories);
    return () => {
      window.removeEventListener('planora-event-categories-changed', applyCategories);
    };
  }, []);

  useEffect(() => {
    const base = defaultStart || new Date();
    if (initial) {
      setTitle(initial.title);
      setDesc(initial.description || '');
      const initialStart = toDateTimeLocal(initial.start_time);
      const initialEnd = toDateTimeLocal(initial.end_time);
      setStart(initialStart);
      setEnd(initialEnd);
      setStartTimeDraft(getTimePart(initialStart));
      setEndTimeDraft(getTimePart(initialEnd));
      const category = resolveEventCategory(initial.event_type, initial.color, categoryOptions);
      setEventType(category.type);
      setColor(category.color);
      setAllDay(initial.is_all_day || false);
      setRecurrenceRule(initial.recurrence_rule || 'none');
      setRecurrenceUntil(initial.recurrence_until ? toDateTimeLocal(initial.recurrence_until).slice(0, 10) : '');
    } else {
      setTitle('');
      setDesc('');
      const defaultStart = toDefaultLocal(base);
      const defaultEnd = toDefaultLocal(base, 1);
      setStart(defaultStart);
      setEnd(defaultEnd);
      setStartTimeDraft(getTimePart(defaultStart));
      setEndTimeDraft(getTimePart(defaultEnd));
      const firstCategory = categoryOptions[0] || getDefaultEventCategories()[0];
      setEventType(firstCategory.type);
      setColor(firstCategory.color);
      setAllDay(false);
      setRecurrenceRule('none');
      setRecurrenceUntil('');
    }
    setError('');
  }, [initial, open, defaultStart, categoryOptions]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }

    let nextStartTime = startTime;
    let nextEndTime = endTime;
    if (!isAllDay) {
      const normalizedStart = normalizeTimeDraft(startTimeDraft);
      const normalizedEnd = normalizeTimeDraft(endTimeDraft);
      if (!normalizedStart || !normalizedEnd) {
        setError('Time must be in 24-hour HH:mm format.');
        return;
      }

      nextStartTime = `${getDatePart(startTime)}T${normalizedStart}`;
      nextEndTime = `${getDatePart(endTime)}T${normalizedEnd}`;
      setStartTimeDraft(normalizedStart);
      setEndTimeDraft(normalizedEnd);
      setStart(nextStartTime);
      setEnd(nextEndTime);
    }

    if (new Date(nextEndTime) <= new Date(nextStartTime)) { setError('End time must be after start time.'); return; }

    if (recurrenceRule !== 'none' && recurrenceUntil) {
      const recurrenceLimit = new Date(`${recurrenceUntil}T23:59:59`).getTime();
      const startTs = new Date(nextStartTime).getTime();
      if (!Number.isFinite(recurrenceLimit) || recurrenceLimit <= startTs) {
        setError('Repeat end date must be after the event start.');
        return;
      }
    }

    setLoading(true);
    try {
      await onSave({
        title: title.trim(),
        description: description || null,
        start_time: new Date(nextStartTime).toISOString(),
        end_time: new Date(nextEndTime).toISOString(),
        event_type: normalizeEventType(eventType),
        color,
        is_all_day: isAllDay,
        recurrence_rule: recurrenceRule,
        recurrence_interval: 1,
        recurrence_until: recurrenceRule === 'none' || !recurrenceUntil ? null : new Date(`${recurrenceUntil}T23:59:59`).toISOString(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg">{initial ? 'Edit event' : 'New event'}</h2>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Read-only notice for workspace events without edit permission */}
          {Boolean(initial?.workspace_id) && initial?.can_edit === false && (
            <div className="p-3 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] text-xs text-[var(--muted-foreground)]">
              This is a group event. Only the creator or group owners can edit it. You can hide it from your calendar if you prefer.
            </div>
          )}

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={Boolean(initial?.workspace_id) && initial?.can_edit === false}
              placeholder="Event title"
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* All day toggle */}
          <div className="inline-flex w-fit items-center gap-2 text-sm select-none">
            <input
              id="all-day-toggle"
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => {
                const checked = e.target.checked;
                setAllDay(checked);
                if (checked) {
                  setStart(`${getDatePart(startTime)}T00:00`);
                  setEnd(`${getDatePart(endTime)}T23:59`);
                  setStartTimeDraft('00:00');
                  setEndTimeDraft('23:59');
                }
              }}
              className="h-4 w-4 rounded border border-[var(--border)]"
            />
            <label htmlFor="all-day-toggle" className="cursor-pointer">All day</label>
          </div>

          {/* Start / End */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] p-3 bg-[var(--background)]/80">
              <label className="text-sm font-medium">Start</label>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <CalendarDays className="h-4 w-4 text-[var(--muted-foreground)]" />
                <DatePicker
                  selected={new Date(startTime)}
                  onChange={(date: Date | null) => {
                    if (!date) return;
                    const nextDate = getDatePart(fromDateToLocalInput(date));
                    const nextTime = isAllDay
                      ? '00:00'
                      : (isValid24HourTime(startTimeDraft) ? startTimeDraft : getTimePart(startTime));
                    setStart(`${nextDate}T${nextTime}`);
                  }}
                  dateFormat="MMM d, yyyy"
                  calendarClassName="planora-datepicker"
                  popperClassName="planora-datepicker-popper"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              {!isAllDay && (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <Clock3 className="h-4 w-4 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    maxLength={5}
                    value={startTimeDraft}
                    onChange={(e) => {
                      const draft = toTimeDraft(e.target.value);
                      setStartTimeDraft(draft);
                      if (isValid24HourTime(draft)) {
                        setStart(`${getDatePart(startTime)}T${draft}`);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const normalized = normalizeTimeDraft(startTimeDraft);
                        if (normalized) {
                          setStartTimeDraft(normalized);
                          setStart(`${getDatePart(startTime)}T${normalized}`);
                        }
                        endTimeInputRef.current?.focus();
                        endTimeInputRef.current?.select();
                      }
                    }}
                    onBlur={() => {
                      const normalized = normalizeTimeDraft(startTimeDraft);
                      if (!normalized) {
                        setStartTimeDraft(getTimePart(startTime));
                        return;
                      }
                      setStartTimeDraft(normalized);
                      setStart(`${getDatePart(startTime)}T${normalized}`);
                    }}
                    className="w-full bg-transparent text-sm outline-none tracking-[0.06em]"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] p-3 bg-[var(--background)]/80">
              <label className="text-sm font-medium">End</label>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                <CalendarDays className="h-4 w-4 text-[var(--muted-foreground)]" />
                <DatePicker
                  selected={new Date(endTime)}
                  onChange={(date: Date | null) => {
                    if (!date) return;
                    const nextDate = getDatePart(fromDateToLocalInput(date));
                    const nextTime = isAllDay
                      ? '23:59'
                      : (isValid24HourTime(endTimeDraft) ? endTimeDraft : getTimePart(endTime));
                    setEnd(`${nextDate}T${nextTime}`);
                  }}
                  minDate={new Date(startTime)}
                  dateFormat="MMM d, yyyy"
                  calendarClassName="planora-datepicker"
                  popperClassName="planora-datepicker-popper"
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              {!isAllDay && (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                  <Clock3 className="h-4 w-4 text-[var(--muted-foreground)]" />
                  <input
                    ref={endTimeInputRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    maxLength={5}
                    value={endTimeDraft}
                    onChange={(e) => {
                      const draft = toTimeDraft(e.target.value);
                      setEndTimeDraft(draft);
                      if (isValid24HourTime(draft)) {
                        setEnd(`${getDatePart(endTime)}T${draft}`);
                      }
                    }}
                    onBlur={() => {
                      const normalized = normalizeTimeDraft(endTimeDraft);
                      if (!normalized) {
                        setEndTimeDraft(getTimePart(endTime));
                        return;
                      }
                      setEndTimeDraft(normalized);
                      setEnd(`${getDatePart(endTime)}T${normalized}`);
                    }}
                    className="w-full bg-transparent text-sm outline-none tracking-[0.06em]"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Recurrence */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-[var(--muted-foreground)]" />
              <label className="text-sm font-medium">Repeat</label>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <select
                value={recurrenceRule}
                onChange={(e) => setRecurrenceRule(e.target.value as 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly')}
                className="h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                style={{
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  backgroundSize: '18px',
                  paddingRight: '36px',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                }}
              >
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {recurrenceRule !== 'none' && (
              <div className="mt-2 flex flex-col gap-1.5">
                <label className="text-xs text-[var(--muted-foreground)]">Repeat until (optional last occurrence date)</label>
                <input
                  type="date"
                  value={recurrenceUntil}
                  onChange={(e) => setRecurrenceUntil(e.target.value)}
                  placeholder="Leave empty for ongoing repeat"
                  className="h-10 px-3 rounded-xl border border-[var(--border)] bg-[var(--card)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
            )}
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Category</label>
            <div className="grid grid-cols-3 gap-1.5">
              {categoryOptions.map((category) => (
                <button
                  key={category.type}
                  type="button"
                  onClick={() => {
                    setEventType(category.type);
                    setColor(category.color);
                  }}
                  title={category.description}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors ${eventType === category.type ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]/60'}`}
                >
                  <span className="h-3 w-3 rounded-sm border border-black/10" style={{ backgroundColor: category.color }} />
                  <span className="font-medium leading-none truncate">{category.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Description <span className="text-[var(--muted-foreground)] font-normal">(optional)</span></label>
              <span className="text-xs text-[var(--muted-foreground)]">{description.length}/350</span>
            </div>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value.slice(0, 350))}
              placeholder="Add description"
              rows={3}
              maxLength={350}
              className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
            />
          </div>

          {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}

          <div className="flex gap-3 justify-between mt-1">
            {initial && !initial.workspace_id && (
              <>
                {/* Delete button - only for users with delete permission */}
                {initial.can_delete && onDelete && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!initial.id) return;
                      setDeleting(true);
                      try {
                        await onDelete(initial.id);
                        onClose();
                      } catch (err: any) {
                        setError(err.message || 'Failed to delete event.');
                      } finally {
                        setDeleting(false);
                      }
                    }}
                    disabled={deleting || loading}
                    className="px-4 py-2 text-sm rounded-lg bg-[var(--destructive)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                )}

              </>
            )}
            {initial?.workspace_id && onDecline && (
              <button
                type="button"
                onClick={async () => {
                  if (!initial.id) return;
                  setDeclining(true);
                  try {
                    await onDecline(initial.id);
                    onClose();
                  } catch (err: any) {
                    setError(err.message || 'Failed to hide event.');
                  } finally {
                    setDeclining(false);
                  }
                }}
                disabled={declining || loading || deleting}
                className="px-4 py-2 text-sm rounded-lg bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted)]/80 transition-colors disabled:opacity-50"
              >
                {declining ? 'Hiding...' : 'Hide from calendar'}
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || deleting || declining || (Boolean(initial?.workspace_id) && initial?.can_edit === false)}
                className="px-4 py-2 text-sm rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? 'Saving...' : initial ? 'Save changes' : 'Create event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
