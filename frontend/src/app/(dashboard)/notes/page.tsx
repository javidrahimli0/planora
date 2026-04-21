import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import NotesHome from '@/components/notes/NotesHome';
import { NoteItem } from '@/types/note';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function getNotes(token: string): Promise<NoteItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/notes?scope=all&page=1&limit=24`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.notes || [];
  } catch {
    return [];
  }
}

export default async function NotesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const notes = await getNotes(session.user.accessToken);

  return <NotesHome initialNotes={notes} />;
}
