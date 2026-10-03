import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { Db } from '../db';
import type { GithubAuth, UserTokens } from '../github/auth';
import { authenticate, SESSION_COOKIE } from './session';

function cookiesWith(tokens: UserTokens): Cookies {
	const jar = new Map([[SESSION_COOKIE, JSON.stringify(tokens)]]);
	return {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => void jar.set(name, value),
		delete: (name: string) => void jar.delete(name)
	} as unknown as Cookies;
}

describe('authenticate', () => {
	it('refreshes an expired session once for requests that arrive together', async () => {
		let refreshes = 0;
		const auth = {
			async refresh() {
				refreshes++;
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { accessToken: 'new', refreshToken: 'next', expiresAt: '2099-01-01T00:00:00Z' };
			},
			async identify(accessToken: string) {
				return accessToken === 'new'
					? { id: 1, nodeId: 'U_1', login: 'reviewer', installationIds: [10] }
					: null;
			}
		} as unknown as GithubAuth;
		const expired = { accessToken: 'old', refreshToken: 'once', expiresAt: '2000-01-01T00:00:00Z' };
		const db = {} as Db;

		const reviewers = await Promise.all([
			authenticate(cookiesWith(expired), auth, db),
			authenticate(cookiesWith(expired), auth, db)
		]);

		expect(refreshes).toBe(1);
		expect(reviewers.map((reviewer) => reviewer?.login)).toEqual(['reviewer', 'reviewer']);
	});
});
