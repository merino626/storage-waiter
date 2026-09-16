/** Startup account verification must be throttled: providers like Mega
 *  rate-limit logins per IP, so probing every account on every launch
 *  (e.g. dev restarts) gets the IP temporarily blocked. */
export const MIGRATION_003_ACCOUNT_VERIFIED_AT = `
ALTER TABLE accounts ADD COLUMN last_verified_at INTEGER;
`;
