import type { Db } from '../db';
import { retentionQueue } from '../jobs';
import { worker } from '../queue';
import { cleanUp } from './cleanup';

export function retentionWorker({ db }: { db: Db }) {
	return worker(retentionQueue, async () => {
		const removed = await cleanUp(db);
		console.info('Retention cleanup', removed);
	});
}
