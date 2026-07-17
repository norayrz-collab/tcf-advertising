import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/dal";
import { buildSnapshot } from "@/lib/snapshot";
import { acquireRefreshLock, releaseRefreshLock, setSnapshot } from "@/lib/store";

// A failed refresh (hard error, not a per-project fetch failure — those are
// caught individually and show up as warnings instead) previously vanished
// into the dev server's own console, which isn't visible outside the running
// process. Logging to a file here means a failure can actually be diagnosed
// instead of guessed at.
const ERROR_LOG_PATH = path.join(process.cwd(), ".refresh-errors.log");

export async function POST() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const acquired = await acquireRefreshLock();
  if (!acquired) {
    return NextResponse.json(
      { error: "A refresh is already in progress, try again shortly." },
      { status: 409 }
    );
  }

  try {
    const snapshot = await buildSnapshot();
    await setSnapshot(snapshot);
    return NextResponse.json(snapshot);
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error("Refresh failed", err);
    try {
      fs.appendFileSync(ERROR_LOG_PATH, `${new Date().toISOString()} ${message}\n\n`);
    } catch {
      // best-effort logging only
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 }
    );
  } finally {
    await releaseRefreshLock();
  }
}
