import { NextResponse, type NextRequest } from "next/server";
import { resolveRedirect, VIEW_PREF_COOKIE } from "@bg/device-routing";

export function middleware(request: NextRequest) {
  const target = resolveRedirect(
    {
      host: request.headers.get("host") ?? "",
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      secChUaMobile: request.headers.get("sec-ch-ua-mobile"),
      userAgent: request.headers.get("user-agent"),
      viewPref: request.cookies.get(VIEW_PREF_COOKIE)?.value ?? null,
    },
    {
      baseDomain: process.env.BASE_DOMAIN ?? "localhost",
      desktopEnabled: process.env.DESKTOP_ENABLED === "true",
      scheme: process.env.URL_SCHEME === "https" ? "https" : "http",
    },
  );
  const response = target ? NextResponse.redirect(target, 302) : NextResponse.next();
  response.headers.set("Accept-CH", "Sec-CH-UA-Mobile");
  response.headers.set("Vary", "Sec-CH-UA-Mobile, User-Agent");
  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api/|ws|_next/|.*\\..*).*)"],
};
