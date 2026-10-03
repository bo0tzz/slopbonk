import type { Db } from '../db';
import type { GithubClient } from '../github/client';
import { worker, type JobSender } from '../queue';
import { fetchHistory } from './history';
import { evaluateQueue, fetchHistoryQueue, jobKey } from '../jobs';

interface Deps {
	db: Db;
	queue: JobSender;
	clientFor: (installationId: number) => Promise<GithubClient>;
}

export function fetchHistoryWorker({ db, queue, clientFor }: Deps) {
	return worker(fetchHistoryQueue, async ({ data }) => {
		await fetchHistory(db, await clientFor(data.installationId), data.userId);
		await queue.send(evaluateQueue, data, { singletonKey: jobKey(data) });
	});
}
