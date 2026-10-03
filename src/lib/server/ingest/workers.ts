import type { Db } from '../db';
import type { GithubClient } from '../github/client';
import { evaluateKey, evaluateQueue } from '../policy/queues';
import { worker, type JobQueue } from '../queue';
import { fetchHistory } from './history';
import { fetchHistoryQueue } from './queues';

interface Deps {
	db: Db;
	queue: Pick<JobQueue, 'send'>;
	clientFor: (installationId: number) => Promise<GithubClient>;
}

export function fetchHistoryWorker({ db, queue, clientFor }: Deps) {
	return worker(fetchHistoryQueue, async ({ data }) => {
		await fetchHistory(db, await clientFor(data.installationId), data.userId);
		await queue.send(evaluateQueue, data, { singletonKey: evaluateKey(data) });
	});
}
