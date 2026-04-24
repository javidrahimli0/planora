'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, View, SlotInfo } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, isSameDay, endOfDay, startOfMonth, endOfMonth, addMonths, addWeeks, subWeeks, subMonths, addDays } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { PlanoraEvent, CalendarEvent } from '@/types/event';
import EventModal from './EventModal';
import EventDetailModal from './EventDetailModal';
import EventHoverPreview from './EventHoverPreview';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { TaskItem } from '@/types/task';
import { buildPagedPath } from '@/lib/pagination';
import { ReactNode } from 'react';
import {
  EventCategoryOption,
  getDefaultEventCategories,
  loadUserEventCategories,
  normalizeEventType,
  resolveEventCategory,
} from '@/lib/eventCategories';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales: { 'en-US': enUS },
});

interface Props {
  initialEvents: PlanoraEvent[];
  initialTasks: TaskItem[];
}

interface EventWrapperProps {
  event: CalendarEvent;
  children: ReactNode;
}

function EventWrapper({ event, children }: EventWrapperProps) {
  return (
    <div data-planora-event-id={event.id} className="h-full">
      {children}
    </div>
  );
}

const VIEW_OPTIONS: Array<{ value: View; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];
const CALENDAR_VIEW_STORAGE_KEY = 'planora-calendar-view';

const parseStoredView = (value: string | null): View => {
  if (value === 'month' || value === 'week' || value === 'day') return value;
  return 'month';
};

export default function CalendarView({ initialEvents, initialTasks }: Props) {
  const { data: session } = useSession();
  const token = session?.user.accessToken || '';

  const [events, setEvents]               = useState<PlanoraEvent[]>(initialEvents);
  const [view, setView]                   = useState<View>(() => {
    if (typeof window === 'undefined') return 'month';
    return parseStoredView(window.localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY));
  });
  const [date, setDate]                   = useState(new Date());
  const [createOpen, setCreateOpen]       = useState(false);
  const [editOpen, setEditOpen]           = useState(false);
  const [detailOpen, setDetailOpen]       = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<PlanoraEvent | null>(null);
  const [defaultStart, setDefaultStart]   = useState<Date>(new Date());
  const [quickTask, setQuickTask]         = useState('');
  const [quickTasks, setQuickTasks]       = useState<TaskItem[]>(initialTasks);
  const [taskSaving, setTaskSaving]       = useState(false);
  const [taskError, setTaskError]         = useState('');
  const [eventsLoading, setEventsLoading] = useState(false);
  const [viewMenuOpen, setViewMenuOpen]   = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<EventCategoryOption[]>(getDefaultEventCategories());
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [hoveredEvent, setHoveredEvent] = useState<PlanoraEvent | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [calendarBounds, setCalendarBounds] = useState<DOMRect | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const calendarContainerRef = useRef<HTMLDivElement | null>(null);
  const eventIdMapRef = useRef<Map<string, PlanoraEvent>>(new Map());
  const EVENT_LIMIT = 280;

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      if (event.workspace_id && event.participant_status === 'declined') return false;
      if (activeCategories.length === 0) return true;
      const category = normalizeEventType(event.event_type || resolveEventCategory(undefined, event.color, categoryOptions).type);
      return activeCategories.includes(category);
    });
  }, [events, activeCategories, categoryOptions]);

  useEffect(() => {
    const applyCategories = () => {
      const categories = loadUserEventCategories();
      setCategoryOptions(categories);
      setActiveCategories((prev) => prev.filter((item) => categories.some((category) => category.type === item)));
    };

    applyCategories();
    window.addEventListener('planora-event-categories-changed', applyCategories);
    return () => {
      window.removeEventListener('planora-event-categories-changed', applyCategories);
    };
  }, []);

  const getWindowBounds = (currentView: View, currentDate: Date) => {
    if (currentView === 'day') {
      const start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
      return { from: start.toISOString(), to: end.toISOString() };
    }

    if (currentView === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const from = subWeeks(start, 2);
      const to = addWeeks(new Date(start.getTime() + (6 * 24 * 60 * 60 * 1000)), 2);
      to.setHours(23, 59, 59, 999);
      return { from: from.toISOString(), to: to.toISOString() };
    }

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const from = startOfMonth(subMonths(monthStart, 1));
    const to = endOfMonth(addMonths(monthEnd, 1));
    to.setHours(23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  };

  const refreshEvents = async (currentView: View, currentDate: Date) => {
    if (!token) return;
    setEventsLoading(true);
    try {
      const window = getWindowBounds(currentView, currentDate);
      const path = buildPagedPath('/api/events', 1, EVENT_LIMIT, {
        from: window.from,
        to: window.to,
      });
      const res = await apiFetch<{ events: PlanoraEvent[] }>(path, token);
      setEvents(res.events || []);
    } catch {
      // Keep previous events in place when refresh fails.
    } finally {
      setEventsLoading(false);
    }
  };

  // Convert to react-big-calendar format
  const calEvents: CalendarEvent[] = visibleEvents.map(e => {
    const start = new Date(e.start_time);
    const originalEnd = new Date(e.end_time);
    const end = view === 'month' && !isSameDay(start, originalEnd)
      ? endOfDay(start)
      : originalEnd;

    return {
      id: e.id,
      title: e.title,
      start,
      end,
      resource: e,
    };
  });

  const upcoming = [...visibleEvents]
    .filter(e => new Date(e.end_time) >= new Date())
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 3);

  const quickTaskItems = [...quickTasks]
    .sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });

  const completedTaskCount = quickTasks.filter(task => task.status === 'done').length;
  const totalTaskCount = quickTasks.length;
  const progressPct = totalTaskCount === 0 ? 0 : Math.round((completedTaskCount / totalTaskCount) * 100);

  const calendarTitle = format(date, 'EEEE, MMM d, yyyy');
  const viewDurationLabel = view === 'month'
    ? format(date, 'MMMM yyyy')
    : view === 'week'
      ? `${format(startOfWeek(date, { weekStartsOn: 1 }), 'MMM dd')} - ${format(new Date(startOfWeek(date, { weekStartsOn: 1 }).getTime() + 6 * 24 * 60 * 60 * 1000), 'MMM dd, yyyy')}`
      : view === 'day'
        ? format(date, 'EEE, MMM d')
        : format(date, 'MMMM yyyy');
  const toolbarBtnClass = 'h-11 px-4 text-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors font-medium whitespace-nowrap';

  const navigate = (dir: 'prev' | 'next' | 'today') => {
    if (dir === 'today') {
      setDate(new Date());
      return;
    }
    setDate((prev) => {
      const step = dir === 'next' ? 1 : -1;
      if (view === 'month') return addMonths(prev, step);
      if (view === 'week') return addWeeks(prev, step);
      return addDays(prev, step);
    });
  };

  useEffect(() => {
    if (!token) return;
    refreshEvents(view, date);
  }, [token, view, date]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, view);
  }, [view]);

  // Update the event ID map whenever visibleEvents changes (no state updates here)
  useEffect(() => {
    const map = new Map<string, PlanoraEvent>();
    visibleEvents.forEach(event => {
      map.set(event.id, event);
    });
    eventIdMapRef.current = map;
  }, [visibleEvents]);

  // Setup event hover listeners for calendar events across all views
  useEffect(() => {
    if (!calendarContainerRef.current) return;

    const container = calendarContainerRef.current;
    let resizeTimeout: NodeJS.Timeout;

    const updateCalendarBounds = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        const bounds = container.getBoundingClientRect();
        setCalendarBounds(bounds);
      }, 100);
    };

    updateCalendarBounds();

    const handleEventMouseEnter = (e: MouseEvent) => {
      const eventElement = (e.target as HTMLElement).closest('[data-planora-event-id]') as HTMLElement | null;
      if (!eventElement) return;

      const eventId = eventElement.dataset.planoraEventId;
      if (!eventId) return;

      const matchedEvent = eventIdMapRef.current.get(eventId);
      if (!matchedEvent) return;

      const anchorElement = (e.target as HTMLElement).closest('.rbc-event') as HTMLElement | null;
      const rect = (anchorElement || eventElement).getBoundingClientRect();
      setHoveredEvent(matchedEvent);
      setHoverPosition({ x: rect.left, y: rect.bottom + 8 });
    };

    const handleEventMouseLeave = (e: MouseEvent) => {
      const eventElement = (e.target as HTMLElement).closest('.rbc-event');
      if (!eventElement) return;
      
      setHoveredEvent(null);
      setHoverPosition(null);
    };

    // Use event delegation on the container
    container.addEventListener('mouseover', handleEventMouseEnter as EventListener);
    container.addEventListener('mouseout', handleEventMouseLeave as EventListener);

    window.addEventListener('resize', updateCalendarBounds);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', updateCalendarBounds);
      container.removeEventListener('mouseover', handleEventMouseEnter as EventListener);
      container.removeEventListener('mouseout', handleEventMouseLeave as EventListener);
    };
  }, [view]);


  // Slot click → open create modal with pre-filled date
  const handleSelectSlot = useCallback((slot: SlotInfo) => {
    setDefaultStart(slot.start);
    setSelectedEvent(null);
    setCreateOpen(true);
  }, []);

  // Event click → open edit modal directly
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event.resource);
    setEditOpen(true);
  }, []);

  // Custom event style
  const eventStyleGetter = (event: CalendarEvent) => ({
    style: {
      backgroundColor: resolveEventCategory(event.resource.event_type, event.resource.color, categoryOptions).color,
      border: 'none',
      borderRadius: '8px',
      color: '#fff',
      fontSize: '0.66rem',
      lineHeight: 1.1,
      padding: '1px 5px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      opacity: event.resource.is_imported ? 0.85 : 1,
    },
  });

  // Create event
  const handleCreate = async (data: Partial<PlanoraEvent>) => {
    const res = await apiFetch<{ event: PlanoraEvent; events?: PlanoraEvent[] }>('/api/events', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Keep create responsive, then refresh the visible window so open-ended repeats materialize immediately.
    setEvents((prev) => [...prev, ...(res.events && res.events.length > 0 ? res.events : [res.event])]);
    await refreshEvents(view, date);
  };

  // Update event
  const handleUpdate = async (data: Partial<PlanoraEvent>) => {
    if (!selectedEvent) return;
    const res = await apiFetch<{ event: PlanoraEvent }>(`/api/events/${selectedEvent.id}`, token, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setEvents((prev) => prev.map((event) => (event.id === res.event.id ? res.event : event)));
  };

  // Delete event
  const handleDelete = async (id: string, scope: 'single' | 'series' = 'single') => {
    const res = await apiFetch<{ message: string; deleted_ids?: string[] }>(`/api/events/${id}?scope=${scope}`, token, { method: 'DELETE' });
    const deletedIds = res.deleted_ids && res.deleted_ids.length > 0 ? res.deleted_ids : [id];
    const deletedSet = new Set(deletedIds);
    setEvents((prev) => prev.filter((event) => !deletedSet.has(event.id)));
  };

  const handleToggleGroupVisibility = async (event: PlanoraEvent, status: 'accepted' | 'declined') => {
    if (!event.workspace_id) return;

    await apiFetch(`/api/events/${event.id}/participation`, token, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    setEvents((prev) => prev.map((item) => {
      if (item.id !== event.id) return item;
      return {
        ...item,
        participant_status: status,
      };
    }));
  };

  const handleDecline = async (id: string) => {
    const event = events.find(e => e.id === id);
    if (!event || !event.workspace_id) throw new Error('Cannot decline non-workspace event');
    await handleToggleGroupVisibility(event, 'declined');
  };

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setViewMenuOpen(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setFilterMenuOpen(false);
      }
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewMenuOpen(false);
        setFilterMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const toggleCategoryFilter = (type: string) => {
    setActiveCategories((prev) => {
      if (prev.includes(type)) {
        return prev.filter((value) => value !== type);
      }
      return [...prev, type];
    });
  };

  const activeFilterLabel = activeCategories.length === 0
    ? 'All tags'
    : activeCategories.length === 1
      ? (categoryOptions.find((category) => category.type === activeCategories[0])?.label || 'All tags')
      : `${activeCategories.length} tags`;

  const addQuickTask = async () => {
    const trimmed = quickTask.trim();
    if (!trimmed) return;
    setTaskSaving(true);
    setTaskError('');
    try {
      const res = await apiFetch<{ task: TaskItem }>('/api/tasks', token, {
        method: 'POST',
        body: JSON.stringify({
          title: trimmed,
          priority: 'medium',
          status: 'pending',
        }),
      });
      setQuickTasks(prev => [res.task, ...prev]);
      setQuickTask('');
    } catch (err: any) {
      setTaskError(err.message || 'Failed to add task.');
    } finally {
      setTaskSaving(false);
    }
  };

  const updateQuickTaskStatus = async (id: string, status: TaskItem['status']) => {
    const res = await apiFetch<{ task: TaskItem }>(`/api/tasks/${id}`, token, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    setQuickTasks(prev => prev.map(task => (task.id === id ? res.task : task)));
  };

  const deleteQuickTask = async (id: string) => {
    await apiFetch<{ message: string }>(`/api/tasks/${id}`, token, { method: 'DELETE' });
    setQuickTasks(prev => prev.filter(task => task.id !== id));
  };

  const calendarHeightClass = view === 'month'
    ? 'flex-1 min-h-[420px]'
    : 'flex-1 min-h-[360px]';

  return (
    <div
      className="grid grid-cols-1 gap-5 h-full min-h-0 xl:grid-cols-[320px_minmax(0,1fr)]"
    >
      <aside
        className="rounded-[28px] border border-[var(--border)] bg-[var(--card)]/96 backdrop-blur-sm shadow-[0_14px_34px_rgba(9,25,48,0.09)] p-3 flex flex-col gap-4 overflow-y-auto h-full min-h-0"
      >
        <div className="rounded-3xl border border-[var(--border)] p-4 bg-[var(--muted)]/45">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Upcoming Events</h2>
            <span className="text-xs text-[var(--muted-foreground)]">Next 3</span>
          </div>

          <div className="flex flex-col gap-2 pr-1">
            {upcoming.length === 0 && (
              <p className="text-sm text-[var(--muted-foreground)]">No upcoming events yet. Add one from the planner.</p>
            )}
            {upcoming.map((ev) => (
              <button
                key={ev.id}
                onClick={() => { setSelectedEvent(ev); setDetailOpen(true); }}
                className="text-left rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 hover:bg-[var(--muted)] transition-colors"
              >
                <p className="text-sm font-medium truncate">{ev.title}</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  {format(new Date(ev.start_time), 'EEE, MMM d · HH:mm')}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--secondary)]/85 dark:bg-[#1f2a44] p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--secondary-foreground)]/80 dark:text-[#c8d6ff]">Task progress</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-4xl leading-none font-semibold text-[var(--secondary-foreground)] dark:text-white">{completedTaskCount}/{totalTaskCount || 0}</span>
            <span className="text-sm text-[var(--secondary-foreground)]/80 dark:text-[#c8d6ff] pb-1">done</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-[var(--background)]/65 dark:bg-[#11192c] overflow-hidden">
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs mt-3 text-[var(--secondary-foreground)]/80 dark:text-[#c8d6ff]">
            {progressPct >= 70 ? 'You are on track this week.' : 'Keep pushing this week.'}
          </p>
        </div>

        <div className="rounded-3xl border border-[var(--border)] p-4 bg-[var(--card)] flex-1 basis-0 min-h-[260px] flex flex-col overflow-hidden">
          <h2 className="text-sm font-semibold mb-3">To Do List</h2>
          <div className="mb-3">
            <input
              type="text"
              value={quickTask}
              onChange={(e) => setQuickTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuickTask(); } }}
              placeholder="Add task and press Enter"
              className="w-full h-11 px-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
          <div className="h-px bg-[var(--border)]/60 mb-2.5" />
          {taskError && <p className="text-xs text-[var(--destructive)] mb-2">{taskError}</p>}

          <div
            className="todo-scroll flex-1 min-h-0 max-h-full flex flex-col gap-1.5 overflow-y-scroll overscroll-contain pr-3"
            style={{ scrollbarGutter: 'stable' }}
          >
            {quickTaskItems.length === 0 && (
              <p className="text-xs text-[var(--muted-foreground)] px-1">No tasks</p>
            )}
            {quickTaskItems.map((task) => (
              <div key={task.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-[var(--muted)]/50 transition-colors">
                <p
                  title={task.title}
                  className={`min-w-0 flex-1 font-medium truncate ${task.status === 'done' ? 'line-through text-[var(--muted-foreground)]' : ''}`}
                >
                  {task.title}
                </p>
                {task.status === 'done' ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => updateQuickTaskStatus(task.id, 'pending')}
                      className="px-2 py-1 rounded-lg border border-[var(--border)] text-xs hover:bg-[var(--muted)]"
                    >
                      Undo
                    </button>
                    <button
                      onClick={() => deleteQuickTask(task.id)}
                      className="px-2 py-1 rounded-lg border border-[var(--destructive)]/40 text-[var(--destructive)] text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => updateQuickTaskStatus(task.id, 'done')}
                    className="px-2 py-1 rounded-lg border border-[var(--border)] text-xs hover:bg-[var(--muted)] shrink-0"
                  >
                    Done
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex flex-col gap-4 min-h-0">
        {/* Toolbar */}
        <div className="relative z-30 rounded-[28px] border border-[var(--border)] bg-[var(--card)]/96 backdrop-blur-sm p-5 shadow-[0_12px_32px_rgba(9,25,48,0.09)] min-h-[92px] flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-4xl md:text-[2.8rem] leading-[1.12] pb-1 font-semibold tracking-tight truncate">{calendarTitle}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap lg:justify-end lg:self-start shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('prev')} className="h-11 w-11 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">‹</button>
              <button onClick={() => navigate('next')} className="h-11 w-11 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">›</button>
              <button onClick={() => navigate('today')} className={toolbarBtnClass}>Today</button>
            </div>
            <div className="h-11 w-full sm:w-[220px] px-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] text-sm font-medium flex items-center justify-center text-center whitespace-nowrap tabular-nums">
              {viewDurationLabel}
            </div>
            <div className="relative z-40" ref={viewMenuRef}>
              <button
                type="button"
                onClick={() => setViewMenuOpen(prev => !prev)}
                className={`${toolbarBtnClass} w-full sm:w-[90px] px-3 flex-shrink-0 inline-flex items-center justify-between gap-1.5 text-left tabular-nums`}
              >
                {VIEW_OPTIONS.find(option => option.value === view)?.label ?? 'View'}
                <span className={`text-xs text-[var(--muted-foreground)] transition-transform ${viewMenuOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {viewMenuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_30px_rgba(9,25,48,0.18)] p-1 z-[120]">
                  {VIEW_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setView(option.value);
                        setViewMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${view === option.value ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'hover:bg-[var(--muted)]'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative z-40" ref={filterMenuRef}>
              <button
                type="button"
                onClick={() => setFilterMenuOpen((prev) => !prev)}
                className={`${toolbarBtnClass} w-auto px-2.5 inline-flex items-center justify-between gap-1.5 whitespace-nowrap`}
              >
                <span className="truncate">{activeFilterLabel}</span>
                <span className={`text-xs text-[var(--muted-foreground)] transition-transform ${filterMenuOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {filterMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[0_12px_30px_rgba(9,25,48,0.18)] p-2 z-[120]">
                  <button
                    type="button"
                    onClick={() => setActiveCategories([])}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeCategories.length === 0 ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'hover:bg-[var(--muted)]'}`}
                  >
                    All events
                  </button>
                  <div className="my-2 h-px bg-[var(--border)]" />
                  <div className="space-y-1">
                    {categoryOptions.map((category) => {
                      const selected = activeCategories.includes(category.type);
                      return (
                        <button
                          key={category.type}
                          type="button"
                          onClick={() => toggleCategoryFilter(category.type)}
                          className={`w-full px-3 py-2 rounded-lg text-sm transition-colors inline-flex items-center justify-between gap-2 ${selected ? 'bg-[var(--primary)]/12 border border-[var(--primary)]/40' : 'hover:bg-[var(--muted)] border border-transparent'}`}
                        >
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: category.color }} />
                            <span className="truncate">{category.label}</span>
                          </span>
                          <span className={`text-xs ${selected ? 'text-[var(--primary)]' : 'text-transparent'}`}>✓</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {/* New event */}
            <button
              onClick={() => { setSelectedEvent(null); setDefaultStart(new Date()); setCreateOpen(true); }}
              className={`${toolbarBtnClass} text-white hover:opacity-90 transition-opacity`}
              style={{ backgroundColor: '#4f8dd9' }}
            >
              + Create
            </button>
          </div>
        </div>

        {/* Calendar */}
        <div ref={calendarContainerRef} className={`relative z-0 rounded-[30px] border border-[var(--border)] overflow-hidden bg-[var(--muted)]/65 backdrop-blur-sm p-3 sm:p-4 shadow-[0_14px_34px_rgba(9,25,48,0.08)] ${calendarHeightClass}`}>
        {eventsLoading && (
          <div className="absolute right-7 top-6 z-10 text-xs text-[var(--muted-foreground)] bg-[var(--card)]/95 px-2.5 py-1.5 rounded-lg border border-[var(--border)]">
            Refreshing events...
          </div>
        )}
        <style>{`
          .rbc-calendar { background: transparent; color: var(--foreground); }
          .rbc-header { border-color: transparent !important; padding: 10px 0; font-size: 0.72rem; letter-spacing: 0.08em; font-weight: 700; color: var(--muted-foreground); text-transform: uppercase; }
          .rbc-month-view, .rbc-time-view { border-color: var(--border) !important; }
          .rbc-month-view { border: none !important; background: transparent !important; }
          .rbc-month-row { border: none !important; }
          .rbc-day-bg { background: transparent !important; border: none !important; }
          .rbc-day-bg + .rbc-day-bg { border-color: transparent !important; }
          .rbc-month-row + .rbc-month-row { border-color: var(--border) !important; }
          .rbc-off-range-bg {
            background: color-mix(in srgb, var(--muted) 74%, var(--card)) !important;
            opacity: 1 !important;
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 65%, white);
          }
          .rbc-off-range {
            color: color-mix(in srgb, var(--muted-foreground) 72%, white) !important;
          }
          .rbc-off-range .rbc-button-link {
            color: color-mix(in srgb, var(--muted-foreground) 72%, white) !important;
            font-weight: 500;
          }
          .rbc-today { background: color-mix(in srgb, var(--secondary) 82%, white) !important; border-radius: 12px; }
          .rbc-toolbar button { color: var(--foreground); border-color: var(--border); background: transparent; }
          .rbc-toolbar button:hover { background: var(--muted); }
          .rbc-toolbar button.rbc-active { background: var(--primary) !important; color: var(--primary-foreground) !important; border-color: var(--primary) !important; }
          .rbc-time-slot { border-color: var(--border) !important; }
          .rbc-timeslot-group { border-color: var(--border) !important; }
          .rbc-time-content { border-color: var(--border) !important; }
          .rbc-time-header-content { border-color: var(--border) !important; }
          .rbc-date-cell { color: var(--muted-foreground); font-size: 0.85rem; font-weight: 600; padding: 10px 10px 0; }
          .rbc-date-cell .rbc-button-link { font-weight: 600; }
          .rbc-date-cell.rbc-now { font-weight: 700; color: var(--foreground); }
          .rbc-show-more { color: var(--primary); font-size: 0.75rem; }
          .rbc-event:focus { outline: none; }
          .rbc-month-row .rbc-row-content { padding: 0 0 4px; }
          .rbc-month-row .rbc-row-bg .rbc-day-bg {
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 58%, white);
            background: color-mix(in srgb, var(--card) 90%, var(--muted)) !important;
            border-radius: 0;
            margin: 0;
            min-height: 88px;
          }
          .rbc-month-row .rbc-row-bg .rbc-off-range-bg {
            background: color-mix(in srgb, var(--card) 94%, white 6%) !important;
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border) 48%, white) !important;
            border-radius: 0;
          }
          .rbc-off-range,
          .rbc-off-range .rbc-button-link,
          .rbc-off-range.rbc-now,
          .rbc-off-range.rbc-now .rbc-button-link {
            color: color-mix(in srgb, var(--muted-foreground) 62%, white) !important;
            font-weight: 400 !important;
          }
          .rbc-month-view .rbc-row-segment {
            padding: 1px 2px;
          }
          .rbc-month-view .rbc-row-segment .rbc-event {
            border-radius: 8px !important;
            box-shadow: 0 6px 18px color-mix(in srgb, var(--primary) 30%, transparent);
            min-height: 19px;
            display: flex;
            align-items: center;
            padding: 0 7px !important;
            width: 100%;
            box-sizing: border-box;
            margin: 0 !important;
          }
          .rbc-time-view {
            border: 1px solid var(--border) !important;
            background: color-mix(in srgb, var(--card) 92%, var(--muted)) !important;
            border-radius: 18px;
            overflow: hidden;
          }
          .rbc-time-header {
            background: color-mix(in srgb, var(--muted) 78%, white) !important;
            border-bottom: 1px solid var(--border) !important;
          }
          .rbc-time-header,
          .rbc-time-header-content,
          .rbc-time-header-gutter,
          .rbc-time-header.rbc-overflowing {
            background: color-mix(in srgb, var(--muted) 78%, white) !important;
          }
          .rbc-time-view .rbc-header {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 44px;
          }
          .rbc-time-header-content,
          .rbc-time-content,
          .rbc-time-gutter,
          .rbc-timeslot-group,
          .rbc-time-slot {
            border-color: var(--border) !important;
          }
          .rbc-time-content {
            background: color-mix(in srgb, var(--card) 94%, var(--muted)) !important;
          }
          .rbc-time-content > .rbc-time-gutter {
            background: color-mix(in srgb, var(--muted) 74%, white) !important;
          }
          .rbc-time-gutter .rbc-label {
            display: block;
            text-align: right;
            padding-right: 8px;
            color: var(--muted-foreground);
          }
          .rbc-time-content > * + * > .rbc-timeslot-group,
          .rbc-day-slot {
            background: color-mix(in srgb, var(--card) 96%, var(--muted)) !important;
          }
          .rbc-time-column + .rbc-time-column {
            border-left: 1px solid var(--border) !important;
          }
          .rbc-label {
            color: var(--muted-foreground);
            font-size: 0.72rem;
            font-weight: 600;
          }
          .rbc-current-time-indicator {
            background-color: var(--primary) !important;
            height: 2px !important;
          }
          .rbc-time-view .rbc-day-slot .rbc-event {
            border-radius: 10px !important;
            border: none !important;
            box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 30%, transparent);
            min-height: 22px;
          }
          .rbc-time-view .rbc-event-content,
          .rbc-time-view .rbc-event-label,
          .rbc-month-view .rbc-event-content {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .rbc-time-view .rbc-event { right: 0 !important; margin-right: 0 !important; }
          .rbc-time-view .rbc-event-label { font-size: 0.7rem; }
          .rbc-day-slot .rbc-events-container { margin-right: 0 !important; }

          .todo-scroll {
            scrollbar-width: thin;
            scrollbar-color: color-mix(in srgb, var(--muted-foreground) 45%, transparent) transparent;
          }
          .todo-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .todo-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .todo-scroll::-webkit-scrollbar-thumb {
            background: color-mix(in srgb, var(--muted-foreground) 45%, transparent);
            border-radius: 999px;
          }
        `}</style>

        <Calendar
          localizer={localizer}
          events={calEvents}
          components={{
            eventWrapper: EventWrapper,
          }}
          views={['month', 'week', 'day']}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          toolbar={false}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          min={new Date(1970, 1, 1, 0, 0, 0)}
          max={new Date(1970, 1, 1, 23, 59, 59)}
          scrollToTime={new Date(1970, 1, 1, 8, 0, 0)}
          step={30}
          timeslots={2}
          showMultiDayTimes
          dayLayoutAlgorithm="no-overlap"
          style={{ height: 710 }}
          popup
        />
        </div>
      </div>

      {/* Create Modal */}
      <EventModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
        defaultStart={defaultStart}
      />

      {/* Edit Modal */}
      <EventModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={handleUpdate}
        onDelete={handleDelete}
        onDecline={handleDecline}
        initial={selectedEvent}
      />

      {/* Detail Modal */}
      {detailOpen && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setDetailOpen(false)}
          onEdit={(ev) => {
            setSelectedEvent(ev);
            setDetailOpen(false);
            setEditOpen(true);
          }}
          onDelete={async (id, scope) => {
            await handleDelete(id, scope);
            setDetailOpen(false);
          }}
          onToggleVisibility={handleToggleGroupVisibility}
        />
      )}

      {/* Event Hover Preview */}
      <EventHoverPreview
        event={hoveredEvent}
        categoryOptions={categoryOptions}
        position={hoverPosition}
        visible={hoveredEvent !== null}
        calendarBounds={calendarBounds}
      />
    </div>
  );
}
