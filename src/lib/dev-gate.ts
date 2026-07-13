// Gate for dev-only surfaces (Agent Console, dev API routes).
//
// Enabled everywhere except the production deployment: on Vercel the
// VERCEL_ENV variable distinguishes production from preview builds (both run
// with NODE_ENV=production, so NODE_ENV alone can't tell them apart); locally
// VERCEL_ENV is unset and any non-production NODE_ENV enables the tools.
export function devToolingEnabled(): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV !== "production";
  }
  return process.env.NODE_ENV !== "production";
}
