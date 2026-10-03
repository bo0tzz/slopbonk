import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordReviewer, saveTokens } from '$lib/server/auth/session';
import { baseUrl } from '$lib/server/env';
import { getServices } from '$lib/server/services';

function fail(reason: string, detail?: string): never {
	console.warn(`Sign-in failed: ${reason}${detail ? ` (${detail})` : ''}`);
	error(400, `Sign-in failed: ${reason}. Please try again.`);
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = cookies.get('slopbonk_oauth_state');
	cookies.delete('slopbonk_oauth_state', { path: '/auth/callback' });

	const githubError = url.searchParams.get('error');
	if (githubError) {
		fail('GitHub reported an error', url.searchParams.get('error_description') ?? githubError);
	}
	if (!state) {
		fail('the sign-in started somewhere else or took too long');
	}
	if (url.searchParams.get('state') !== state) {
		fail('the sign-in request did not match');
	}
	const code = url.searchParams.get('code');
	if (!code) {
		fail('GitHub did not return a code');
	}

	const { auth, db } = getServices();
	const tokens = await auth.exchangeCode(code, `${baseUrl()}/auth/callback`);
	const identity = await auth.identify(tokens.accessToken);
	if (!identity) {
		fail('GitHub did not accept the sign-in');
	}
	await recordReviewer(db, identity);
	saveTokens(cookies, tokens);
	redirect(302, '/');
};
