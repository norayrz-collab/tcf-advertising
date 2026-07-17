import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession, type SessionData } from "./session";

/** For pages/layouts: redirects to /login if there is no valid session. */
export const verifySession = cache(async (): Promise<SessionData> => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

/** For Route Handlers: returns null instead of redirecting, so callers can return a 401. */
export const requireSession = cache(async (): Promise<SessionData | null> => {
  return getSession();
});

export function isAdmin(email: string) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

/** For admin-only Server Actions: throws if the caller isn't signed in as an admin. */
export async function requireAdminSession(): Promise<SessionData> {
  const session = await verifySession();
  if (!isAdmin(session.email)) {
    throw new Error("Not authorized");
  }
  return session;
}
