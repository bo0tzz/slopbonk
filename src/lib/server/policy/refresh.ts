import type { Db } from '../db';
import { fetchHistoryQueue, jobKey } from '../jobs';
import type { JobSender } from '../queue';

/** Queues a history fetch for each account with a case, through one of the installations it's in. */
export async function refreshCases(db: Db, queue: JobSender): Promise<number> {
	const accounts = await db
		.selectFrom('cases')
		.innerJoin('installations', 'installations.id', 'cases.installation_id')
		.distinctOn('cases.user_id')
		.select(['cases.user_id', 'cases.installation_id'])
		.where('installations.uninstalled_at', 'is', null)
		.orderBy('cases.user_id')
		.execute();
	for (const { user_id, installation_id } of accounts) {
		const job = { installationId: installation_id, userId: user_id };
		await queue.send(fetchHistoryQueue, job, { singletonKey: jobKey(job) });
	}
	return accounts.length;
}
