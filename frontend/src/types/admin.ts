export interface AdminStats {
  userCount: number;
  songCount: number;
  pendingCount: number;
  noFormatCount: number;
  languageDistribution: { language: string; count: number }[];
  recentSongs: {
    id: number;
    title: string;
    artist: string;
    username: string;
    created_at: string;
  }[];
}

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  disabled: boolean;
  song_count: number;
  created_at: string;
}

export interface InactiveSong {
  id: number;
  title: string;
  artist: string;
  username: string;
  updated_at: string;
  deactivated_by: string | null;
}

export interface HistoryEntry {
  id: number;
  created_at: string;
  actor_name: string;
  action: string;
  target_type: 'song' | 'user';
  target_id: number | null;
  target_name: string;
  details: Record<string, unknown> | null;
  has_snapshot: boolean;
  snapshot?: string | null;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface InviteCode {
  id: number;
  code: string;
  created_at: string;
  used_at: string | null;
}

export interface AdminConfig {
  allowRegistration: boolean;
}

export interface AdminTag {
  name: string;
  count: number;
}

export interface AdminTagList {
  tags: AdminTag[];
  isDefault: boolean;
}
