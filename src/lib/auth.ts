// Sign In with YouVersion — Step 6.
//
// NextAuth (Auth.js v5) with a custom YouVersion OAuth 2.0 provider. The
// endpoints and PKCE flow mirror the official @youversion/platform-core SDK
// (src/SignInWithYouVersionPKCE.ts there): YouVersion is a *public* client —
// the OAuth client_id is the platform app key and there is no client secret;
// PKCE + nonce + state secure the flow. User identity comes from the ID token
// JWT (claims: sub, name, profile_picture, email).
//
// Endpoints deliberately use the api.youversion.com host, matching the SDK.
// YouVersion does publish an OIDC discovery document, but it points at
// login.youversion.com endpoints that return 404 and omits a userinfo
// endpoint — Auth.js's OIDC/discovery path cannot consume it. A plain OAuth
// provider with explicit endpoints avoids that entirely.
//
// `nonce` is in `checks` because YouVersion rejects any authorize request
// whose scope includes `openid` without one ("nonce is required when scope
// includes openid"). Auth.js generates and sends it for OAuth providers too.
// The ID token is decoded (not signature-verified) for the profile, the same
// trade-off the official SDK makes: the token arrives straight from
// YouVersion's token endpoint over TLS in the same server request, and
// YouVersion re-validates every token on its own API calls.
//
// Sessions are database-backed via the Drizzle adapter; the adapter's
// (provider, providerAccountId) key is what guarantees "sign out, sign back
// in — same row, no duplicate". Instant Access (Path B) never touches
// NextAuth — it stays the signed sessionStorage token from Step 8.

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import NextAuth from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import { db } from "@/db";
import { accounts, sessions, users } from "@/db/schema";

const YOUVERSION_API_HOST = "api.youversion.com";

/** Claims YouVersion puts in its ID token. */
interface YouVersionProfile {
  sub: string;
  name?: string;
  email?: string;
  profile_picture?: string;
}

// The OAuth client_id is the YouVersion app key. A dedicated
// YOUVERSION_OAUTH_CLIENT_ID wins if ever set; otherwise the API key is used,
// matching the official SDK, which passes the app key as client_id.
function youVersionClientId(): string {
  const id =
    process.env.YOUVERSION_OAUTH_CLIENT_ID || process.env.YOUVERSION_API_KEY;
  if (!id) {
    throw new Error(
      "YOUVERSION_OAUTH_CLIENT_ID or YOUVERSION_API_KEY must be set — see .env.example",
    );
  }
  return id;
}

/** Decodes a JWT payload without verification — the token came straight from
 * YouVersion's token endpoint over TLS in the same request, so its origin is
 * already authenticated; the same trade-off the official SDK makes. */
function decodeJwtPayload(token: string): YouVersionProfile {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Malformed ID token from YouVersion");
  return JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as YouVersionProfile;
}

function youVersionProvider(): OAuthConfig<YouVersionProfile> {
  const provider = {
    id: "youversion",
    name: "YouVersion",
    type: "oauth",
    // YouVersion returns an ID token in the token response, and Auth.js /
    // oauth4webapi validate its claims when present. `issuer` must equal the
    // token's `iss` (this exact value) or the `iss` check fails; without it,
    // Auth.js defaults the expected issuer to authjs.dev and rejects sign-in.
    issuer: "https://api.youversion.com/auth/token",
    clientId: youVersionClientId(),
    // Public client: PKCE only, no client secret.
    client: { token_endpoint_auth_method: "none" },
    // `nonce` is generated and sent by Auth.js for any provider whose checks
    // include it (verified in @auth/core checks.js); the OAuthConfig type only
    // advertises it for OIDC providers, hence the cast on the return below.
    checks: ["pkce", "state", "nonce"],
    authorization: {
      url: `https://${YOUVERSION_API_HOST}/auth/authorize`,
      // User-data permissions are NOT OAuth scopes on this gateway: apps ask
      // for them with `requested_permissions` (comma-separable; values match
      // SignInWithYouVersionPermission in the official SDK), and the OAuth
      // callback reports `granted_permissions`. `highlights` authorises the
      // User Highlights API — the permission only makes import *possible*;
      // Round imports nothing until the user explicitly allows it on the
      // in-app consent screen (Step 7). `require_user_interaction` forces
      // YouVersion's consent screen on every sign-in: without it, an
      // already-authorised user is silently re-issued their old grant and a
      // permission added after their first sign-in would never be requested.
      params: {
        scope: "openid profile email",
        requested_permissions: "highlights",
        require_user_interaction: "true",
      },
    },
    token: `https://${YOUVERSION_API_HOST}/auth/token`,
    // YouVersion has no userinfo endpoint — identity is carried in the ID
    // token returned by the token endpoint; decode it here.
    userinfo: {
      url: `https://${YOUVERSION_API_HOST}/auth/token`,
      async request({ tokens }: { tokens: { id_token?: string } }) {
        if (!tokens.id_token) {
          throw new Error("YouVersion token response had no id_token");
        }
        return decodeJwtPayload(tokens.id_token);
      },
    },
    profile(profile: YouVersionProfile) {
      return {
        id: profile.sub,
        name: profile.name ?? "YouVersion reader",
        email: profile.email ?? null,
        image: profile.profile_picture ?? null,
      };
    },
  };
  return provider as OAuthConfig<YouVersionProfile>;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
  }),
  session: { strategy: "database" },
  providers: [youVersionProvider()],
  pages: {
    // Sign-in starts from the landing page CTA; failures land back on the
    // landing page with ?error=… rendered as a banner — never a raw error
    // page, per the step spec.
    signIn: "/",
    error: "/",
  },
  events: {
    // The adapter writes the accounts row only when the account is first
    // linked — repeat sign-ins would otherwise keep the original (possibly
    // expired, or narrower-scoped) access token forever. Step 7's highlight
    // import reads accounts.access_token, so refresh the stored tokens on
    // every OAuth sign-in.
    async signIn({ account }) {
      if (!account?.access_token) return;
      await db
        .update(accounts)
        .set({
          access_token: account.access_token,
          refresh_token: account.refresh_token ?? null,
          expires_at: account.expires_at ?? null,
          scope: account.scope ?? null,
          token_type: account.token_type ?? null,
          id_token: account.id_token ?? null,
        })
        .where(
          and(
            eq(accounts.provider, account.provider),
            eq(accounts.providerAccountId, account.providerAccountId),
          ),
        );
    },
  },
  callbacks: {
    session({ session, user }) {
      // `user` is the full users row from the adapter — surface the fields
      // the app needs (id for data access, language/version for reading).
      session.user.id = user.id;
      session.user.language = user.language ?? null;
      session.user.bibleVersionId = user.bibleVersionId ?? null;
      session.user.highlightsConsent = user.highlightsConsent ?? null;
      return session;
    },
  },
});

declare module "next-auth" {
  interface User {
    language?: string | null;
    bibleVersionId?: number | null;
    highlightsConsent?: string | null;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      language: string | null;
      bibleVersionId: number | null;
      /** Step 7 consent state: "granted" | "declined" | "revoked" | null. */
      highlightsConsent: string | null;
    };
  }
}
