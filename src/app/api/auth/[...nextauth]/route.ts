import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

export const dynamic = "force-dynamic";

// YouVersion's OAuth callback is a two-hop flow (confirmed by observing a real
// sign-in, and matching the official SDK's handleAuthCallback): after login,
// YouVersion first redirects to our callback with `state` and the user's
// profile fields (user_name, user_email, yvp_id, profile_picture) but *no*
// authorization `code`. The recovery is to bounce that request — all params
// intact — to YouVersion's own /auth/callback, which mints the code and
// redirects back here with `code` + the same `state`. On that second arrival
// `code` is present, so we hand off to Auth.js, whose state/PKCE/nonce cookies
// still validate because the whole round trip is a browser redirect chain.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (
    url.pathname.endsWith("/callback/youversion") &&
    url.searchParams.has("state") &&
    !url.searchParams.has("code") &&
    !url.searchParams.has("error")
  ) {
    const bounce = new URL("https://api.youversion.com/auth/callback");
    url.searchParams.forEach((value, key) =>
      bounce.searchParams.set(key, value),
    );
    return NextResponse.redirect(bounce);
  }
  return handlers.GET(request);
}

export const POST = handlers.POST;
