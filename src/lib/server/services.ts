// Composition root: builds every long-lived dependency once at startup and wires the workers.
import { createDb, type Db } from './db';
import { migrateToLatest } from './db/migrate';
import { databaseUrl, githubApp } from './env';
import { createApp, installationClient, type GithubClient } from './github/client';
import { fetchHistoryWorker } from './ingest/workers';
import { queues } from './jobs';
import { startQueue, type JobQueue } from './queue';

export interface Services {
	db: Db;
	queue: JobQueue;
	clientFor: (installationId: number) => Promise<GithubClient>;
	webhookSecret: string;
}

let services: Services | undefined;

export async function startServices(): Promise<Services> {
	const github = githubApp();
	const app = createApp(github);
	const clientFor = (installationId: number) => installationClient(app, installationId);

	const db = createDb(databaseUrl());
	await migrateToLatest(db);

	const queue = await startQueue(databaseUrl(), queues, (queue) => [
		fetchHistoryWorker({ db, queue, clientFor })
	]);

	services = { db, queue, clientFor, webhookSecret: github.webhookSecret };
	return services;
}

export function getServices(): Services {
	if (!services) {
		throw new Error('Services have not been started');
	}
	return services;
}

export async function stopServices(): Promise<void> {
	if (services) {
		await services.queue.stop();
		await services.db.destroy();
	}
}
