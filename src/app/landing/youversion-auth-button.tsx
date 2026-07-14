"use client";

import { YouVersionProvider } from "@youversion/platform-react-hooks";
import { YouVersionAuthButton } from "@youversion/platform-react-ui";
import "@youversion/platform-react-ui/styles.css";
import { useYouVersionSignIn } from "@/lib/use-youversion-sign-in";

/*
 * Official "Sign in with YouVersion" button from @youversion/platform-react-ui,
 * wired to Round's NextAuth flow instead of the SDK's client-side token flow.
 *
 * How the wiring works:
 * - The SDK button must render inside YouVersionProvider's auth context. Auth
 *   is host-controlled (`userInfo={null}`): the SDK performs no token
 *   handling, no localStorage, and — importantly — does not try to interpret
 *   the landing page's ?error=… (NextAuth's sign-in failure redirect) as an
 *   OAuth callback.
 * - `onClickCapture` + stopPropagation intercepts the tap in the capture
 *   phase, so the SDK's own signIn never runs; NextAuth owns the redirect.
 * - `authRedirectUrl=""` is defence in depth: if the SDK signIn ever did run,
 *   it throws on the empty redirect URL before touching window.location.
 *
 * The appKey is the public OAuth client_id (it appears verbatim in the
 * authorize URL), so passing it to the client is safe by design.
 */
export function SignInWithYouVersion({ appKey }: { appKey: string }) {
  const { start, busy, error } = useYouVersionSignIn();

  return (
    <YouVersionProvider
      appKey={appKey}
      includeAuth
      authRedirectUrl=""
      userInfo={null}
    >
      <span
        className="inline-flex"
        onClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!busy) void start();
        }}
      >
        <YouVersionAuthButton
          background="light"
          radius="rounded"
          disabled={busy}
          text={busy ? "Opening YouVersion…" : undefined}
        />
      </span>
      {error && <p className="text-sm text-danger">{error}</p>}
    </YouVersionProvider>
  );
}
