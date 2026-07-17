import "server-only";
import { sealData, unsealData } from "iron-session";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "ads_dashboard_session";
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getPassword() {
  const password = process.env.SESSION_SECRET;
  if (!password) {
    throw new Error("SESSION_SECRET env var is not set");
  }
  return password;
}

export type SessionData = {
  email: string;
};

export async function sealSession(data: SessionData) {
  return sealData(data, { password: getPassword(), ttl: TTL_SECONDS });
}

export async function unsealSession(seal: string): Promise<SessionData | null> {
  try {
    return await unsealData<SessionData>(seal, {
      password: getPassword(),
      ttl: TTL_SECONDS,
    });
  } catch {
    return null;
  }
}

export async function createSession(email: string) {
  const seal = await sealSession({ email });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, seal, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const seal = cookieStore.get(SESSION_COOKIE)?.value;
  if (!seal) return null;
  return unsealSession(seal);
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
