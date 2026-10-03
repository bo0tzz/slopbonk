// The jobs that ingest, policy and act send each other. Components depend on these contracts,
// never on each other's modules.
import { defineQueue, type QueueDefinition } from './queue';

export interface AccountInInstallation {
	installationId: number;
	userId: number;
}

export function jobKey({ installationId, userId }: AccountInInstallation): string {
	return `${installationId}:${userId}`;
}

/** Keyed per installation, so each requester gets its follow-up evaluation; freshness avoids refetching. */
export const fetchHistoryQueue = defineQueue<AccountInInstallation>('ingest.fetch-history', {
	policy: 'stately'
});

/** One queued evaluation per account and installation at a time; repeats are dropped. */
export const evaluateQueue = defineQueue<AccountInInstallation>('policy.evaluate', {
	policy: 'stately'
});

export interface InstallationJob {
	installationId: number;
}

/** Lists the installation's repositories and queues the first page of each kind of thread. */
export const backfillQueue = defineQueue<InstallationJob>('ingest.backfill', {
	policy: 'stately',
	retryBackoff: true
});

export interface BackfillPage {
	installationId: number;
	repository: { id: number; owner: string; name: string };
	kind: 'discussion' | 'issue' | 'pull_request';
	cursor: string | null;
	/** ISO timestamp, fixed when the backfill starts so retries and later pages share one window. */
	since: string;
}

export function backfillPageKey({
	installationId,
	repository,
	kind,
	cursor
}: BackfillPage): string {
	return `${installationId}:${repository.id}:${kind}:${cursor ?? 'first'}`;
}

/** One page of a repository's recently updated threads; queues the next page itself. */
export const backfillPageQueue = defineQueue<BackfillPage>('ingest.backfill-page', {
	policy: 'stately',
	retryBackoff: true
});

export interface OutboxItem {
	outboxId: number;
}

export const OUTBOX_RETRY_LIMIT = 3;

/** Carries out one outbox item against GitHub; retried with backoff before the item is marked failed. */
export const outboxQueue = defineQueue<OutboxItem>('act.outbox', {
	retryLimit: OUTBOX_RETRY_LIMIT,
	retryBackoff: true
});

export const queues: QueueDefinition<object>[] = [
	fetchHistoryQueue,
	evaluateQueue,
	backfillQueue,
	backfillPageQueue,
	outboxQueue
];
