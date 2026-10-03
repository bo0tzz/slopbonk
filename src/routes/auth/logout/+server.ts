import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { signOut } from '$lib/server/auth/session';
import { getServices } from '$lib/server/services';

export const POST: RequestHandler = async ({ cookies }) => {
	await signOut(cookies, getServices().auth);
	redirect(303, '/');
};
