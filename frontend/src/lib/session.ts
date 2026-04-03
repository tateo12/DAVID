export const AUTH_STORAGE_KEY = "sentinel_auth_v1";

export type AuthUser = {
  id: number;
  username: string;
  role: string;
  employee_id: number | null;
  org_id: number | null;
  org_name?: string;
};

export type StoredSession = {
  access_token: string;
  expires_at?: string;
  user: AuthUser;
};

export function getSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredSession;
    if (!data?.access_token || !data?.user?.role) return null;
    return data;
  } catch {
    return null;
  }
}

export function setSession(session: StoredSession): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("sentinel-auth"));
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event("sentinel-auth"));
}

/** Returns true if the session expires within the next 15 minutes (or has already expired). */
export function sessionNeedsRefresh(session: StoredSession): boolean {
  if (!session.expires_at) return false;
  const expiresMs = new Date(session.expires_at).getTime();
  return Date.now() >= expiresMs - 15 * 60 * 1000;
}

/** Employers (managers) may create and edit policies; employees are read-only on the policies page. */
export function isPolicyEditor(role: string): boolean {
  return role === "manager" || role === "admin";
}

/** Manager / admin: team directory, invites, employee edits. */
export function isTeamManager(role: string): boolean {
  return role === "manager" || role === "admin";
}

/** Same as team manager: run scheduled jobs manually from the command dashboard (`/api/ops/*`). */
export function isAutomationManager(role: string): boolean {
  return isTeamManager(role);
}
