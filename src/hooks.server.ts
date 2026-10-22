import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { authenticate } from '#lib/server/auth/session.js';
import { getServices, startServices, stopServices } from '#lib/server/services.js';

export const init: ServerInit = async () => {
	await startServices();
	process.once('sveltekit:shutdown', stopServices);
};

export const handle: Handle = async ({ event, resolve }) => {
	const { auth, db } = getServices();
	event.locals.reviewer = await authenticate(event.cookies, auth, db);
	return resolve(event);
};
