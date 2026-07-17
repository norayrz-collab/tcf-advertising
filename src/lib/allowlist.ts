import "server-only";
import Redis from "ioredis";

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
const ALLOWLIST_KEY = "invited_emails";

// Emails from ALLOWED_EMAILS always count as allowed, on top of whatever is in
// Redis. This keeps the env var as a permanent bootstrap/break-glass list (so a
// misconfigured or empty Redis set can never lock everyone out) while day-to-day
// invites go through the Redis-backed /admin/invites page below.
function envAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (envAllowedEmails().includes(normalized)) return true;
  // Redis isn't configured (e.g. local dev without REDIS_URL) — only the
  // env-var bootstrap list works until it is, rather than crashing login.
  if (!redis) return false;
  return (await redis.sismember(ALLOWLIST_KEY, normalized)) === 1;
}

export async function listInvitedEmails(): Promise<{ email: string; source: "env" | "redis" }[]> {
  const [envEmails, redisEmails] = await Promise.all([
    Promise.resolve(envAllowedEmails()),
    redis ? redis.smembers(ALLOWLIST_KEY) : Promise.resolve([] as string[]),
  ]);
  const redisSet = new Set(redisEmails);
  const all = new Set([...envEmails, ...redisSet]);
  return [...all]
    .sort()
    .map((email) => ({ email, source: envEmails.includes(email) ? "env" : "redis" }));
}

export async function inviteEmail(email: string): Promise<void> {
  if (!redis) throw new Error("Redis is not configured (REDIS_URL missing) — invites need it.");
  await redis.sadd(ALLOWLIST_KEY, email.trim().toLowerCase());
}

export async function revokeEmail(email: string): Promise<void> {
  if (!redis) throw new Error("Redis is not configured (REDIS_URL missing) — invites need it.");
  await redis.srem(ALLOWLIST_KEY, email.trim().toLowerCase());
}
