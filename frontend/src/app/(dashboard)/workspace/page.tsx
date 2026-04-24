import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import CalendarView from '@/components/calendar/CalendarView';
import { PlanoraEvent } from '@/types/event';
import { TaskItem } from '@/types/task';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getInitialEventWindow() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function getEvents(token: string): Promise<PlanoraEvent[]> {
  try {
    const window = getInitialEventWindow();
    const params = new URLSearchParams({
      page: '1',
      limit: '240',
      from: window.from,
      to: window.to,
    });
    const res = await fetch(`${API_URL}/api/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

async function getTasks(token: string): Promise<TaskItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/tasks?page=1&limit=40`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.tasks || [];
  } catch {
    return [];
  }
}

export default async function WorkspacePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const events = await getEvents(session.user.accessToken);
  const tasks = await getTasks(session.user.accessToken);

  return (
    <div className="min-h-0 lg:h-[calc(100dvh-8rem)]">
      <CalendarView initialEvents={events} initialTasks={tasks} />
    </div>
  );
}
