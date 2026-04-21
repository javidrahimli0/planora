import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import WorkspacesBoard from '@/components/workspaces/WorkspacesBoard';
import { WorkspaceItem } from '@/types/workspace';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getWorkspaces(token: string): Promise<WorkspaceItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces?page=1&limit=12`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.workspaces || [];
  } catch {
    return [];
  }
}

export default async function WorkspacesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const workspaces = await getWorkspaces(session.user.accessToken);

  return (
    <div className="min-h-0 lg:h-[calc(100dvh-8rem)]">
      <WorkspacesBoard initialWorkspaces={workspaces} />
    </div>
  );
}
