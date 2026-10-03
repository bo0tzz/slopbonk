import { defineQueue } from '../queue';

export interface FetchHistoryPayload {
	installationId: number;
	userId: number;
}

/** Keyed per installation, so each requester gets its follow-up evaluation; freshness avoids refetching. */
export const fetchHistoryQueue = defineQueue<FetchHistoryPayload>('ingest.fetch-history', {
	policy: 'stately'
});

export function fetchHistoryKey({ installationId, userId }: FetchHistoryPayload): string {
	return `${installationId}:${userId}`;
}
