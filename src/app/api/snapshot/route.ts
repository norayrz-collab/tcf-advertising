import { NextResponse } from "next/server";
import { requireSession } from "@/lib/dal";
import { getSnapshot } from "@/lib/store";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      { error: "No snapshot yet. Click Refresh to pull data from the sheet." },
      { status: 404 }
    );
  }

  return NextResponse.json(snapshot);
}
