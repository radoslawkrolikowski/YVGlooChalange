// Standard Auth.js catch-all route. YouVersion is wired as an OIDC provider
// off its discovery document (see src/lib/auth.ts), so the authorization code
// is returned straight to this callback — no custom handling needed.
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
