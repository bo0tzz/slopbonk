import { getDb } from '../db/instance';
import { clientFor } from '../github/instance';
import { fetchHistoryQueue } from '../ingest/queues';
import { fetchHistoryWorker } from '../ingest/workers';
import { evaluateQueue } from '../policy/queues';
import type { JobQueue, QueueDefinition, Worker } from '.';

export const queues: QueueDefinition<object>[] = [fetchHistoryQueue, evaluateQueue];

export function createWorkers(queue: JobQueue): Worker<object>[] {
	const db = getDb();
	return [fetchHistoryWorker({ db, queue, clientFor })];
}
