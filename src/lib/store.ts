import "server-only";
import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import type { Snapshot } from "./types";

const redis = Redis.fromEnv();

const SNAPSHOT_KEY = "snapshot:latest";
const LOCK_KEY = "refresh:lock";
const FULL_CAMPAIGNS_SINCE_KEY = "settings:fullCampaignsSinceDate";
const DEFAULT_FULL_CAMPAIGNS_SINCE = "2026-01-01";
// Generous: a refresh now fetches every project's own sheet (600+ of them),
// which at Google's ~60-reads/minute quota can take well over 10 minutes.
const LOCK_TTL_SECONDS = 1800;

const useRedis = !!process.env.UPSTASH_REDIS_REST_URL;

// Local fallback (no Redis configured yet): persisted to a file on disk rather
// than a plain in-memory variable. Next.js dev (Turbopack) compiles Server
// Actions and Route Handlers into separately-bundled module graphs, so a
// module-level `let` does NOT reliably stay shared between e.g. the Settings
// page's save action and the Refresh route — each can end up reading/writing
// its own instance, silently losing state. A real file on disk is shared
// regardless of which module instance touches it. Not meant for production
// (single-machine only) — swap to Redis before deploying anywhere with
// multiple instances.
const LOCAL_STORE_PATH = path.join(process.cwd(), ".local-store.json");

interface LocalStore {
  snapshot: Snapshot | null;
  lockUntil: number;
  fullCampaignsSinceDate: string | null;
}

function readLocalStore(): LocalStore {
  try {
    const raw = fs.readFileSync(LOCAL_STORE_PATH, "utf8");
    return { snapshot: null, lockUntil: 0, fullCampaignsSinceDate: null, ...JSON.parse(raw) };
  } catch {
    return { snapshot: null, lockUntil: 0, fullCampaignsSinceDate: null };
  }
}

function writeLocalStore(patch: Partial<LocalStore>): void {
  const current = readLocalStore();
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify({ ...current, ...patch }));
}

export async function getSnapshot(): Promise<Snapshot | null> {
  if (!useRedis) return readLocalStore().snapshot;
  return redis.get<Snapshot>(SNAPSHOT_KEY);
}

export async function setSnapshot(snapshot: Snapshot): Promise<void> {
  if (!useRedis) {
    writeLocalStore({ snapshot });
    return;
  }
  await redis.set(SNAPSHOT_KEY, snapshot);
}

/** Returns true if the lock was acquired, false if a refresh is already in flight. */
export async function acquireRefreshLock(): Promise<boolean> {
  const lockUntil = Date.now() + LOCK_TTL_SECONDS * 1000;
  if (!useRedis) {
    const store = readLocalStore();
    if (Date.now() < store.lockUntil) return false;
    writeLocalStore({ lockUntil });
    return true;
  }
  // Store the expiry timestamp itself (not just a placeholder "1") so
  // getRefreshStatus can report how long a refresh has been running.
  const result = await redis.set(LOCK_KEY, String(lockUntil), { nx: true, ex: LOCK_TTL_SECONDS });
  return result === "OK";
}

export async function releaseRefreshLock(): Promise<void> {
  if (!useRedis) {
    writeLocalStore({ lockUntil: 0 });
    return;
  }
  await redis.del(LOCK_KEY);
}

export interface RefreshStatus {
  inProgress: boolean;
  startedAt: string | null;
}

/** Lets the UI show "a refresh is running" regardless of which tab/user
 * triggered it, and roughly how long it's been going — refreshes can take
 * up to LOCK_TTL_SECONDS given the ~600+ individual sheets fetched. */
export async function getRefreshStatus(): Promise<RefreshStatus> {
  let lockUntil: number | null = null;
  if (!useRedis) {
    lockUntil = readLocalStore().lockUntil || null;
  } else {
    const stored = await redis.get<string>(LOCK_KEY);
    lockUntil = stored ? Number(stored) : null;
  }

  if (!lockUntil || Date.now() >= lockUntil) {
    return { inProgress: false, startedAt: null };
  }
  const startedAt = new Date(lockUntil - LOCK_TTL_SECONDS * 1000).toISOString();
  return { inProgress: true, startedAt };
}

/** Controls how far back we pull each Full-campaign project's own "Live Ads"
 * tab during a refresh. Separate from the dashboard's own date-range filter,
 * which only changes what's displayed from data already fetched. */
export async function getFullCampaignsSinceDate(): Promise<string> {
  if (!useRedis) return readLocalStore().fullCampaignsSinceDate ?? DEFAULT_FULL_CAMPAIGNS_SINCE;
  const stored = await redis.get<string>(FULL_CAMPAIGNS_SINCE_KEY);
  return stored ?? DEFAULT_FULL_CAMPAIGNS_SINCE;
}

export async function setFullCampaignsSinceDate(date: string): Promise<void> {
  if (!useRedis) {
    writeLocalStore({ fullCampaignsSinceDate: date });
    return;
  }
  await redis.set(FULL_CAMPAIGNS_SINCE_KEY, date);
}
