import { databaseUrl } from '../env';
import { startQueue, type JobQueue } from '.';
import { queues, workers } from './registry';

let queue: JobQueue | undefined;

export async function startJobQueue(): Promise<JobQueue> {
	queue ??= await startQueue(databaseUrl(), queues, workers);
	return queue;
}

export function getJobQueue(): JobQueue {
	if (!queue) {
		throw new Error('Job queue has not been started');
	}
	return queue;
}
