import type { Db } from '../db';
import type { GithubActions } from '../github/actions';
import { OUTBOX_RETRY_LIMIT, outboxQueue } from '../jobs';
import { worker } from '../queue';
import { carryOut } from './outbox';

interface Deps {
	db: Db;
	actionsFor: (installationId: number) => Promise<GithubActions>;
}

export function outboxWorker({ db, actionsFor }: Deps) {
	return worker(outboxQueue, async (job) => {
		await carryOut(db, actionsFor, job.data.outboxId, job.retryCount >= OUTBOX_RETRY_LIMIT);
	});
}
