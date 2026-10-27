/**
 * A message to show for a failed save. Drizzle wraps database errors as
 * "Failed query: <sql> params: …" and keeps Postgres's own reason (e.g. a
 * duplicate key) in `cause` — show that instead of the SQL.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) return cause.message;
  return err.message || fallback;
}
