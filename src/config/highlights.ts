// Shared in-app highlight limits (Step 14; module extracted in Step 30A when
// the anonymous path moved from browser sessionStorage to session-scoped rows
// and the old client-only module went away). Config, not server code, so both
// the reading screen and the API route can import it.

/** Longest selection stored for one in-app highlight — both session paths. */
export const MAX_SESSION_HIGHLIGHT_LENGTH = 300;
