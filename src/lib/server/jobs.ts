import { defineQueue, type QueueDefinition, type QueueOptions } from './queue';

/** Rides out a GitHub outage of up to about half an hour. Rate limits defer jobs instead. */
const GITHUB_RETRIES = {
	retryLimit: 5,
	retryDelay: 30,
	retryBackoff: true,
	retryDelayMax: 60 * 60
} satisfies QueueOptions;

const LOCAL_RETRIES = { retryLimit: 3, retryDelay: 5, retryBackoff: true } satisfies QueueOptions;

/** One installation's GitHub calls go one at a time, as GitHub asks of each token. */
const byInstallation = ({ installationId }: { installationId: number }) => String(installationId);

export interface AccountInInstallation {
	installationId: number;
	userId: number;
}

export function jobKey({ installationId, userId }: AccountInInstallation): string {
	return `${installationId}:${userId}`;
}

/** Keyed per installation, so each requester gets its follow-up evaluation; freshness avoids refetching. */
export const fetchHistoryQueue = defineQueue<AccountInInstallation>(
	'ingest.fetch-history',
	{ policy: 'stately', ...GITHUB_RETRIES },
	byInstallation
);

/** One queued evaluation per account and installation at a time; repeats are dropped. */
export const evaluateQueue = defineQueue<AccountInInstallation>('policy.evaluate', {
	policy: 'stately',
	...LOCAL_RETRIES
});

export interface BackfillJob {
	installationId: number;
	/** Only these of the installation's repositories, e.g. ones just added to it; otherwise all. */
	repositoryIds?: number[];
}

/** Lists the installation's repositories and queues the first page of each kind of thread. */
export const backfillQueue = defineQueue<BackfillJob>(
	'ingest.backfill',
	{ policy: 'stately', ...GITHUB_RETRIES },
	byInstallation
);

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
export const backfillPageQueue = defineQueue<BackfillPage>(
	'ingest.backfill-page',
	{ policy: 'stately', ...GITHUB_RETRIES },
	byInstallation
);

export interface BackfillComments {
	installationId: number;
	thread: { id: string; kind: BackfillPage['kind'] };
	/** Set to page through this discussion comment's replies instead of the thread's comments. */
	commentId: string | null;
	cursor: string | null;
	since: string;
}

export function backfillCommentsKey({
	installationId,
	thread,
	commentId,
	cursor
}: BackfillComments): string {
	return `${installationId}:${commentId ?? thread.id}:${cursor ?? 'first'}`;
}

/** Comments a thread page didn't include: older ones, and discussion replies. */
export const backfillCommentsQueue = defineQueue<BackfillComments>(
	'ingest.backfill-comments',
	{ policy: 'stately', ...GITHUB_RETRIES },
	byInstallation
);

export interface OutboxItem {
	installationId: number;
	outboxId: number;
}

export const OUTBOX_RETRY_LIMIT = GITHUB_RETRIES.retryLimit;

/** Carries out one outbox item against GitHub; retried with backoff before the item is marked failed. */
export const outboxQueue = defineQueue<OutboxItem>('act.outbox', GITHUB_RETRIES, byInstallation);

/** Applies the retention rules (ADR-0004); scheduled daily. */
export const retentionQueue = defineQueue<Record<string, never>>('retention.cleanup', {
	policy: 'stately',
	...LOCAL_RETRIES
});

export const queues: QueueDefinition<object>[] = [
	fetchHistoryQueue,
	evaluateQueue,
	backfillQueue,
	backfillPageQueue,
	backfillCommentsQueue,
	outboxQueue,
	retentionQueue
];
