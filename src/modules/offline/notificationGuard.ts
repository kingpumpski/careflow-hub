const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Remote notification rows require a real Supabase Auth UUID.
 * Offline mode uses a synthetic local identity and must never write it to Postgres.
 */
export function canPersistRemoteUserNotification(
  userId: string | null | undefined,
  offline: boolean,
): boolean {
  return !offline && typeof userId === "string" && UUID_PATTERN.test(userId);
}
