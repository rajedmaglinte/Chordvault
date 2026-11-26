export interface User {
  id: number;
  username: string;
  role: string;
  token: string;
  church_id?: number | null;
  church_name?: string | null;
}

export interface AuthConfig {
  allowRegistration: boolean;
  invitesEnabled: boolean;
  turnstileSiteKey: string | null;
  demoMode: boolean;
}

export interface AuthResponse {
  id: number;
  username: string;
  role: string;
  token: string;
  church_id?: number | null;
  church_name?: string | null;
}
