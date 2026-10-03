import type { ServerInit } from '@sveltejs/kit';
import { startServices, stopServices } from '$lib/server/services';

export const init: ServerInit = async () => {
	await startServices();
	process.once('sveltekit:shutdown', stopServices);
};
