'use client';

import NotesHome from './NotesHome';
import { NoteItem } from '@/types/note';

interface Props {
  initialNotes: NoteItem[];
}

export default function NotesBoard({ initialNotes }: Props) {
  return <NotesHome initialNotes={initialNotes} />;
}
