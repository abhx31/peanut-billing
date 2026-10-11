import type { PoolConfig } from "pg";

/**
 * Pool settings from DATABASE_URL. `sslmode` is taken out of the URL and applied as `ssl` here:
 * pg warns that `sslmode=require` is treated as `verify-full`, and an sslmode in the URL
 * overrides any `ssl` option passed next to it. Behaviour is unchanged: TLS with a verified
 * certificate (Neon's certificates are publicly trusted).
 */
export function pgConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  const mode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: mode && mode !== "disable" ? { rejectUnauthorized: true } : undefined,
  };
}
