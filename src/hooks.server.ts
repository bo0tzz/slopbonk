import type { ServerInit } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { migrateToLatest } from '$lib/server/db/migrate';

export const init: ServerInit = async () => {
	await migrateToLatest(getDb());
};
