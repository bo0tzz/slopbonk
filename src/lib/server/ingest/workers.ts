import type { Db } from '../db';
import type { GithubClient } from '../github/client';
import { worker, type JobSender } from '../queue';
import { backfillComments, backfillPage, startBackfill } from './backfill';
import { fetchHistory } from './history';
import {
	backfillCommentsQueue,
	backfillPageQueue,
	backfillQueue,
	evaluateQueue,
	fetchHistoryQueue,
	jobKey
} from '../jobs';

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

export function backfillWorker({ db, queue, clientFor }: Deps) {
	return worker(backfillQueue, async ({ data }) => {
		await startBackfill(db, queue, await clientFor(data.installationId), data.installationId);
	});
}

export function backfillPageWorker({ db, queue, clientFor }: Deps) {
	return worker(backfillPageQueue, async ({ data }) => {
		await backfillPage(db, queue, await clientFor(data.installationId), data);
	});
}

export function backfillCommentsWorker({ db, queue, clientFor }: Deps) {
	return worker(backfillCommentsQueue, async ({ data }) => {
		await backfillComments(db, queue, await clientFor(data.installationId), data);
	});
}
