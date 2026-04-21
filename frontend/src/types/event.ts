export type PlanoraEventType = string;

export interface PlanoraEvent {
  id: string;
  user_id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  event_type: PlanoraEventType;
  color: string;
  is_all_day: boolean;
  is_imported: boolean;
  ics_uid: string | null;
  source: 'planora' | 'google' | 'outlook' | 'apple' | 'imported';
  location: string | null;
  series_id?: string | null;
  created_at: string;
  updated_at: string;
  participant_status?: 'pending' | 'accepted' | 'declined' | null;
  participant_decline_reason?: string | null;
  recurrence_rule?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurrence_interval?: number;
  recurrence_until?: string | null;
  recurrence_parent_id?: string | null;
  recurrence_index?: number;
  can_edit?: boolean;
  can_delete?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: PlanoraEvent;
}
