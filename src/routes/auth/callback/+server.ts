import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordReviewer, saveTokens } from '$lib/server/auth/session';
import { baseUrl } from '$lib/server/env';
import { getServices } from '$lib/server/services';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = cookies.get('slopbonk_oauth_state');
	cookies.delete('slopbonk_oauth_state', { path: '/auth/callback' });
	const code = url.searchParams.get('code');
	if (!code || !state || url.searchParams.get('state') !== state) {
		error(400, 'Sign-in failed; please try again.');
	}

	const { auth, db } = getServices();
	const tokens = await auth.exchangeCode(code, `${baseUrl()}/auth/callback`);
	const identity = await auth.identify(tokens.accessToken);
	if (!identity) {
		error(400, 'GitHub did not accept the sign-in; please try again.');
	}
	await recordReviewer(db, identity);
	saveTokens(cookies, tokens);
	redirect(302, '/');
};
