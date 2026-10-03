const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Re-evaluate an account at these offsets after it first comments in an installed repository (ADR-0002). */
export const RECHECK_OFFSETS_MS = [1 * HOUR, 24 * HOUR, 3 * DAY];

/** How far back the first history fetch for an account goes (ADR-0002). */
export const HISTORY_HORIZON_MS = 365 * DAY;

/** How far back to backfill comments when an organisation installs the app. */
export const INSTALL_BACKFILL_MS = 30 * DAY;

/** A stored history younger than this satisfies a fetch request without calling GitHub. */
export const HISTORY_FRESHNESS_MS = 15 * 60 * 1000;

/** Retention (ADR-0004). */
export const RETENTION = {
	/** History comments of accounts with no open or blocked case, after their last evaluation. */
	unflaggedHistoryMs: 30 * DAY,
	/** Evaluations of accounts with no decision. */
	unlabelledEvaluationsMs: 90 * DAY,
	/** Evaluations that a decision was based on. */
	labelledEvaluationsMs: 2 * 365 * DAY,
	/** Tenant data after the app is uninstalled. */
	uninstalledTenantMs: 30 * DAY
};

/** Author associations whose comments never put an account in the review queue (ADR-0003). */
export const EXEMPT_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR', 'CONTRIBUTOR'];

/** A dismissed account returns to the queue once its score exceeds the dismissed score by this much. */
export const REOPEN_SCORE_MARGIN = 1;

/** Lifetime of a reviewer's session cookie before membership is checked again (ADR-0002). */
export const SESSION_LIFETIME_MS = 1 * HOUR;
