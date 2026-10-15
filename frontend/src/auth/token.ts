const TOKEN_KEY = "trainerapp_access_token";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Fired when the server rejects a stored token (expired/invalid) mid-session. */
export const AUTH_EXPIRED_EVENT = "auth:expired";
