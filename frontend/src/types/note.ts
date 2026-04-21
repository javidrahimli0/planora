export interface NoteItem {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string | null;
  content: string;
  note_group: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  access_permission: 'owner' | 'viewer';
  access_scope: 'mine' | 'shared_by_me' | 'shared_with_me';
  shares_count: number;
  shared_workspaces: string[];
}

export interface NoteShareItem {
  note_id: string;
  workspace_id: string;
  workspace_name: string;
  permission: 'viewer';
  shared_by: string;
  created_at: string;
  updated_at: string;
}
