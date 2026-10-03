import { randomBytes } from 'node:crypto';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { baseUrl } from '$lib/server/env';
import { getServices } from '$lib/server/services';

export const GET: RequestHandler = ({ cookies, url }) => {
	// The state cookie has to live on the same host as the registered callback URL.
	if (url.origin !== baseUrl()) {
		redirect(302, `${baseUrl()}/auth/login`);
	}
	const state = randomBytes(16).toString('hex');
	cookies.set('slopbonk_oauth_state', state, {
		path: '/auth/callback',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600
	});
	redirect(302, getServices().auth.authorizationUrl(state, `${baseUrl()}/auth/callback`));
};
