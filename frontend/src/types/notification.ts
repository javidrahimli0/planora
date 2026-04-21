export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface NotificationPreferenceItem {
  user_id: string;
  type: string;
  is_muted: boolean;
  updated_at: string;
}
