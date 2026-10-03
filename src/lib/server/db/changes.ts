import pg from 'pg';
import { REVIEW_CHANGES_CHANNEL } from './schema/functions';

/** A row that reviewers see changed: a case, an outbox item or an installation. */
export interface ReviewChange {
	table: 'cases' | 'outbox' | 'installations';
	installationId: number;
	userId: number | null;
}

export interface ReviewChanges {
	subscribe(listener: (change: ReviewChange) => void): () => void;
	stop(): Promise<void>;
}

const RECONNECT_MS = [1000, 2000, 5000, 10_000, 30_000];

/** Listens on one dedicated connection and fans each change out to every subscriber. */
export async function listenForReviewChanges(connectionString: string): Promise<ReviewChanges> {
	const listeners = new Set<(change: ReviewChange) => void>();
	let client: pg.Client | null = null;
	let stopped = false;
	let attempt = 0;

	async function connect() {
		const next = new pg.Client({ connectionString });
		next.on('notification', ({ payload }) => {
			if (!payload) {
				return;
			}
			const change = JSON.parse(payload) as ReviewChange;
			for (const listener of listeners) {
				listener(change);
			}
		});
		next.on('error', () => dropped(next));
		next.on('end', () => dropped(next));
		await next.connect();
		await next.query(`LISTEN ${REVIEW_CHANGES_CHANNEL}`);
		client = next;
		attempt = 0;
	}

	function scheduleReconnect() {
		const delay = RECONNECT_MS[Math.min(attempt++, RECONNECT_MS.length - 1)];
		setTimeout(() => {
			if (stopped) {
				return;
			}
			connect().catch((error) => {
				console.error('Listening for review changes failed', error);
				scheduleReconnect();
			});
		}, delay).unref();
	}

	function dropped(failed: pg.Client) {
		if (stopped || client !== failed) {
			return;
		}
		client = null;
		failed.removeAllListeners();
		void failed.end().catch(() => {});
		scheduleReconnect();
	}

	await connect();
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async stop() {
			stopped = true;
			const current = client;
			client = null;
			await current?.end();
		}
	};
}
