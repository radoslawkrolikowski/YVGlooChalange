// Sign In with YouVersion — Step 6.
//
// NextAuth (Auth.js v5) with a custom YouVersion OAuth 2.0 provider. The
// endpoint shapes mirror the official @youversion/platform-core SDK exactly
// (src/SignInWithYouVersionPKCE.ts there): YouVersion is a PKCE public
// client — the OAuth client_id is the platform app key and there is no
// client secret; the token endpoint is authenticated by the PKCE verifier
// alone. User identity comes from the ID token JWT (claims: sub, name,
// profile_picture, email).
//
// Sessions are database-backed via the Drizzle adapter; the adapter's
// (provider, providerAccountId) key is what guarantees "sign out, sign back
// in — same row, no duplicate". Instant Access (Path B) never touches
// NextAuth — it stays the signed sessionStorage token from Step 8.

import { DrizzleAdapter } from "@auth/drizzle-adapter";
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
  return {
    id: "youversion",
    name: "YouVersion",
    type: "oauth",
    clientId: youVersionClientId(),
    // Public client: PKCE only, no client secret.
    client: { token_endpoint_auth_method: "none" },
    checks: ["pkce", "state"],
    authorization: {
      url: `https://${YOUVERSION_API_HOST}/auth/authorize`,
      params: { scope: "openid profile email" },
    },
    token: `https://${YOUVERSION_API_HOST}/auth/token`,
    // No userinfo endpoint — identity is carried in the ID token returned by
    // the token endpoint; decode it here instead of a second HTTP call.
    userinfo: {
      url: `https://${YOUVERSION_API_HOST}/auth/token`,
      async request({ tokens }: { tokens: { id_token?: string } }) {
        if (!tokens.id_token) {
          throw new Error("YouVersion token response had no id_token");
        }
        return decodeJwtPayload(tokens.id_token);
      },
    },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name ?? `YouVersion reader`,
        email: profile.email ?? null,
        image: profile.profile_picture ?? null,
      };
    },
  };
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
  callbacks: {
    session({ session, user }) {
      // `user` is the full users row from the adapter — surface the fields
      // the app needs (id for data access, language/version for reading).
      session.user.id = user.id;
      session.user.language = user.language ?? null;
      session.user.bibleVersionId = user.bibleVersionId ?? null;
      return session;
    },
  },
});

declare module "next-auth" {
  interface User {
    language?: string | null;
    bibleVersionId?: number | null;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      language: string | null;
      bibleVersionId: number | null;
    };
  }
}
