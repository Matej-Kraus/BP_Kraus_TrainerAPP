/** Client-generated id (used to make retried requests idempotent). */
export function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // crypto.randomUUID needs a secure context; fall back for plain-http LAN testing.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
