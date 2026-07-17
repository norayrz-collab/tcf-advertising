import { NextRequest, NextResponse } from "next/server";
import { unsealSession, SESSION_COOKIE } from "@/lib/session";

// Optimistic check only (cookie presence + decrypt), per Next.js's recommended
// pattern: real per-request authorization still happens in Route Handlers/DAL.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const seal = request.cookies.get(SESSION_COOKIE)?.value;
  const session = seal ? await unsealSession(seal) : null;

  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
