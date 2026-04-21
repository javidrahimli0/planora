'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { TaskItem, TaskPriority, TaskStatus } from '@/types/task';

interface Props {
  initialTasks: TaskItem[];
}

const STATUS: TaskStatus[] = ['pending', 'in_progress', 'done'];
const PRIORITY: TaskPriority[] = ['low', 'medium', 'high'];

export default function TasksBoard({ initialTasks }: Props) {
  const { data: session } = useSession();
  const token = session?.user.accessToken || '';

  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [status, setStatus] = useState<TaskStatus>('pending');
  const [filterStatus, setFilterStatus] = useState<'all' | TaskStatus>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | TaskPriority>('all');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterStatus !== 'all' && task.status !== filterStatus) return false;
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, filterPriority, filterStatus]);

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch<{ task: TaskItem }>('/api/tasks', token, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description || null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          priority,
          status,
        }),
      });

      setTasks((prev) => [res.task, ...prev]);
      setTitle('');
      setDescription('');
      setDueDate('');
      setPriority('medium');
      setStatus('pending');
    } catch (err: any) {
      setError(err.message || 'Failed to create task.');
    } finally {
      setSaving(false);
    }
  };

  const patchTask = async (id: string, payload: Partial<TaskItem>) => {
    const res = await apiFetch<{ task: TaskItem }>(`/api/tasks/${id}`, token, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    setTasks((prev) => prev.map((task) => (task.id === id ? res.task : task)));
  };

  const removeTask = async (id: string) => {
    await apiFetch<{ message: string }>(`/api/tasks/${id}`, token, { method: 'DELETE' });
    setTasks((prev) => prev.filter((task) => task.id !== id));
  };

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-5">
      <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)]">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">Track priorities, due dates, and progress in one place.</p>
      </div>

      <form onSubmit={createTask} className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)] grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
        >
          {PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus)}
          className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
        >
          {STATUS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className="md:col-span-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        {error && <p className="md:col-span-2 text-sm text-[var(--destructive)]">{error}</p>}
        <button disabled={saving} className="md:col-span-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-50">
          {saving ? 'Saving...' : 'Add task'}
        </button>
      </form>

      <div className="rounded-[24px] border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-[0_10px_30px_rgba(9,25,48,0.08)]">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | TaskStatus)}
            className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
          >
            <option value="all">All status</option>
            {STATUS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as 'all' | TaskPriority)}
            className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm"
          >
            <option value="all">All priority</option>
            {PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-3">
          {visibleTasks.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">No tasks yet for the selected filter.</p>
          )}
          {visibleTasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{task.title}</p>
                  {task.description && <p className="text-sm text-[var(--muted-foreground)] mt-1">{task.description}</p>}
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    {task.due_date ? `Due ${new Date(task.due_date).toLocaleString()}` : 'No due date'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={task.status}
                    onChange={(e) => patchTask(task.id, { status: e.target.value as TaskStatus })}
                    className="px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs"
                  >
                    {STATUS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  <select
                    value={task.priority}
                    onChange={(e) => patchTask(task.id, { priority: e.target.value as TaskPriority })}
                    className="px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs"
                  >
                    {PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="px-2 py-1 rounded-lg border border-[var(--destructive)]/40 text-[var(--destructive)] text-xs"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
