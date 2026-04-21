export interface WorkspaceItem {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  role: 'owner' | 'member';
  member_count: number;
  has_unseen_messages: boolean;
  last_message_at: string | null;
}

export interface WorkspaceMemberItem {
  id: string;
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  name: string;
  email: string;
}

export interface WorkspaceInvitationItem {
  id: string;
  workspace_id: string;
  inviter_id: string;
  invitee_email: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
  workspace_name?: string;
  inviter_name?: string;
}

export interface WorkspaceMessageItem {
  id: string;
  workspace_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_email: string;
  author_avatar_url: string | null;
}

export interface WorkspaceSharedNoteItem {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  note_group: string;
  is_pinned: boolean;
  updated_at: string;
  permission: 'viewer';
  owner_name: string;
  owner_email: string;
  can_edit: boolean;
  access_permission: 'owner' | 'viewer';
}

export interface WorkspaceUpcomingEventItem {
  id: string;
  workspace_id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  color: string;
  is_all_day: boolean;
  location: string | null;
  creator_name: string;
  creator_email: string;
  participant_status: 'pending' | 'accepted' | 'declined';
  not_joining_count: number;
  joining_count: number;
  pending_count: number;
}

export interface WorkspaceEventParticipantItem {
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  status: 'pending' | 'accepted' | 'declined';
  decline_reason: string | null;
  responded_at: string | null;
  is_creator: boolean;
}
