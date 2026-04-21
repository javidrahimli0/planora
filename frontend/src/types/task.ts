export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface TaskItem {
  id: string;
  user_id: string;
  workspace_id: string | null;
  event_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}
