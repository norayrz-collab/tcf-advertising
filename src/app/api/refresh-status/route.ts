import { NextResponse } from "next/server";
import { requireSession } from "@/lib/dal";
import { getRefreshStatus } from "@/lib/store";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getRefreshStatus();
  return NextResponse.json(status);
}
