import { defineQueue } from '../queue';

export interface EvaluatePayload {
	installationId: number;
	userId: number;
}

/** One queued evaluation per account and installation at a time; repeats are dropped. */
export const evaluateQueue = defineQueue<EvaluatePayload>('policy.evaluate', { policy: 'stately' });

export function evaluateKey({ installationId, userId }: EvaluatePayload): string {
	return `${installationId}:${userId}`;
}
