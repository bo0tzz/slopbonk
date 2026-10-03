import type { ServerInit } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/instance';
import { migrateToLatest } from '$lib/server/db/migrate';
import { startJobQueue } from '$lib/server/queue/instance';

export const init: ServerInit = async () => {
	const db = getDb();
	await migrateToLatest(db);
	const queue = await startJobQueue();
	process.once('sveltekit:shutdown', async () => {
		await queue.stop();
		await db.destroy();
	});
};
