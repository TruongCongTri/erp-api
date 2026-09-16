export interface ActorSnapshot {
  name: string;
  avatarUrl?: string;
  jobTitle?: string;
}

export interface InlineActionItem {
  action: string;
  label: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload?: Record<string, unknown>;
}
