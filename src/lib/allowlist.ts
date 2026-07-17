import "server-only";
import bcrypt from "bcryptjs";
import Redis from "ioredis";

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
// Redis hash: email -> bcrypt hash of that person's own password.
const INVITED_USERS_KEY = "invited_users";

// ALLOWED_EMAILS is a permanent bootstrap/break-glass admin list, checked
// against the single shared APP_PASSWORD_HASH — this keeps working even if
// Redis is misconfigured or empty. Everyone else invited via /admin/invites
// gets their own password, stored per-email in Redis.
function envAllowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdminEmail(email: string): boolean {
  return envAllowedEmails().includes(email.trim().toLowerCase());
}

export type PasswordCheckResult = "ok" | "wrong-password" | "not-found";

/** Checks an invited (non-bootstrap) user's own password. */
export async function verifyInvitedPassword(email: string, password: string): Promise<PasswordCheckResult> {
  if (!redis) return "not-found";
  const normalized = email.trim().toLowerCase();
  const hash = await redis.hget(INVITED_USERS_KEY, normalized);
  if (!hash) return "not-found";
  return (await bcrypt.compare(password, hash)) ? "ok" : "wrong-password";
}

export async function listInvitedEmails(): Promise<{ email: string; source: "env" | "redis" }[]> {
  const envEmails = envAllowedEmails();
  const redisEmails = redis ? await redis.hkeys(INVITED_USERS_KEY) : [];
  const all = new Set([...envEmails, ...redisEmails]);
  return [...all]
    .sort()
    .map((email) => ({ email, source: envEmails.includes(email) ? "env" : "redis" }));
}

/** Invites an email with its own password (bcrypt-hashed before storage). */
export async function inviteEmail(email: string, password: string): Promise<void> {
  if (!redis) throw new Error("Redis is not configured (REDIS_URL missing) — invites need it.");
  const hash = await bcrypt.hash(password, 10);
  await redis.hset(INVITED_USERS_KEY, email.trim().toLowerCase(), hash);
}

export async function revokeEmail(email: string): Promise<void> {
  if (!redis) throw new Error("Redis is not configured (REDIS_URL missing) — invites need it.");
  await redis.hdel(INVITED_USERS_KEY, email.trim().toLowerCase());
}
