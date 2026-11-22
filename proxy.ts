import { NextResponse, type NextRequest } from "next/server";

import { routeExists } from "@/lib/route-guards";

/**
 * Answers URLs that cannot exist with a real 404 before the page streams (a streamed page is already `200`
 * when it finds out). No database access here: see src/lib/route-guards.ts.
 */
export function proxy(request: NextRequest) {
  if (routeExists(request.nextUrl.pathname)) return NextResponse.next();
  // No route matches this path, so the router renders app/not-found.tsx with status 404.
  return NextResponse.rewrite(new URL("/__not-found", request.url));
}

export const config = {
  matcher: ["/titles/:path+", "/seasons/:path+", "/channels/:path+"]
};
