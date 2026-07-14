import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

export const dynamic = "force-dynamic";

// YouVersion flow quirk (mirrored from the official SDK's handleAuthCallback):
// the authorize step can first redirect back to the app with state but no
// authorization code. The SDK's remedy is to bounce the callback, parameters
// intact, to YouVersion's /auth/callback endpoint, which then redirects back
// here with the code. State survives the round trip, so NextAuth's CSRF check
// still passes on the second arrival.
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
