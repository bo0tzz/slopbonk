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

export const queues: QueueDefinition<object>[] = [fetchHistoryQueue, evaluateQueue];
