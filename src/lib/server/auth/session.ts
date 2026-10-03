import type { Cookies } from '@sveltejs/kit';
import { REVIEWER_CACHE_MS } from '../constants';
import type { Db } from '../db';
import type { GithubAuth, UserIdentity, UserTokens } from '../github/client';

export const SESSION_COOKIE = 'slopbonk_session';

/** Refresh this long before GitHub's expiry, so a request never carries a token that lapses mid-flight. */
const EXPIRY_MARGIN_MS = 60 * 1000;

export interface Reviewer {
	id: number;
	login: string;
	installationIds: number[];
}

export function saveTokens(cookies: Cookies, tokens: UserTokens) {
	cookies.set(SESSION_COOKIE, JSON.stringify(tokens), {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 180
	});
}

function readTokens(cookies: Cookies): UserTokens | null {
	const raw = cookies.get(SESSION_COOKIE);
	if (!raw) {
		return null;
	}
	try {
		return JSON.parse(raw) as UserTokens;
	} catch {
		return null;
	}
}

const cache = new Map<string, { identity: UserIdentity; until: number }>();

async function identify(auth: GithubAuth, accessToken: string, now: number) {
	const cached = cache.get(accessToken);
	if (cached && cached.until > now) {
		return cached.identity;
	}
	const identity = await auth.identify(accessToken);
	for (const [token, entry] of cache) {
		if (entry.until <= now) {
			cache.delete(token);
		}
	}
	if (identity) {
		cache.set(accessToken, { identity, until: now + REVIEWER_CACHE_MS });
	}
	return identity;
}

/** The signed-in reviewer, refreshing their token if needed; null when there's no valid session. */
export async function authenticate(
	cookies: Cookies,
	auth: GithubAuth,
	now = Date.now()
): Promise<Reviewer | null> {
	let tokens = readTokens(cookies);
	if (!tokens) {
		return null;
	}

	if (tokens.expiresAt && Date.parse(tokens.expiresAt) - EXPIRY_MARGIN_MS <= now) {
		if (!tokens.refreshToken) {
			cookies.delete(SESSION_COOKIE, { path: '/' });
			return null;
		}
		try {
			tokens = await auth.refresh(tokens.refreshToken);
		} catch {
			cookies.delete(SESSION_COOKIE, { path: '/' });
			return null;
		}
		saveTokens(cookies, tokens);
	}

	const identity = await identify(auth, tokens.accessToken, now);
	if (!identity) {
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return null;
	}
	return { id: identity.id, login: identity.login, installationIds: identity.installationIds };
}

/** Reviewers are GitHub users too; decisions reference them. */
export async function recordReviewer(db: Db, identity: UserIdentity) {
	await db
		.insertInto('github_users')
		.values({ id: identity.id, node_id: identity.nodeId, login: identity.login })
		.onConflict((oc) =>
			oc.column('id').doUpdateSet({ node_id: identity.nodeId, login: identity.login })
		)
		.execute();
}

export async function signOut(cookies: Cookies, auth: GithubAuth) {
	const tokens = readTokens(cookies);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	if (tokens) {
		cache.delete(tokens.accessToken);
		await auth.revoke(tokens.accessToken).catch(() => {});
	}
}
