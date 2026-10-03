// Composition root: builds every long-lived dependency once at startup and wires the workers.
import { createDb, type Db } from './db';
import { migrateToLatest } from './db/migrate';
import { databaseUrl, githubApp } from './env';
import { outboxWorker } from './act/workers';
import { requeuePending } from './act/outbox';
import { installationActions } from './github/actions';
import { createApp } from './github/app';
import { RateLimitedError } from './github/rate-limit';
import { installationClient } from './github/reads';
import { appAuth, type GithubAuth } from './github/auth';
import {
	backfillCommentsWorker,
	backfillPageWorker,
	backfillWorker,
	fetchHistoryWorker
} from './ingest/workers';
import { queues, retentionQueue } from './jobs';
import { evaluateWorker } from './policy/workers';
import { retentionWorker } from './retention/workers';
import { githubBlockChangeWorker } from './review/workers';
import { startQueue, type JobQueue } from './queue';

export interface Services {
	db: Db;
	queue: JobQueue;
	auth: GithubAuth;
	webhookSecret: string;
}

let services: Services | undefined;

export async function startServices(): Promise<Services> {
	const github = githubApp();
	const app = createApp(github);
	const clientFor = (installationId: number) => installationClient(app, installationId);
	const actionsFor = (installationId: number) => installationActions(app, installationId);

	const db = createDb(databaseUrl());
	await migrateToLatest(db);

	const deferUntil = (error: unknown) => (error instanceof RateLimitedError ? error.until : null);
	const queue = await startQueue(
		databaseUrl(),
		queues,
		(queue) => [
			fetchHistoryWorker({ db, queue, clientFor }),
			backfillWorker({ db, queue, clientFor }),
			backfillPageWorker({ db, queue, clientFor }),
			backfillCommentsWorker({ db, queue, clientFor }),
			evaluateWorker({ db, queue }),
			outboxWorker({ db, actionsFor }),
			githubBlockChangeWorker({ db }),
			retentionWorker({ db })
		],
		{ deferUntil }
	);
	await queue.schedule(retentionQueue, '17 3 * * *', {});
	await requeuePending(db, queue);

	services = { db, queue, auth: appAuth(app), webhookSecret: github.webhookSecret };
	return services;
}

export function getServices(): Services {
	if (!services) {
		throw new Error('Services have not been started');
	}
	return services;
}

export async function stopServices(): Promise<void> {
	const stopping = services;
	services = undefined;
	if (stopping) {
		await stopping.queue.stop();
		await stopping.db.destroy();
	}
}
