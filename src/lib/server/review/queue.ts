import { QUEUE_THRESHOLD } from '../constants';
import type { Db } from '../db';
import type { CaseState } from '../db/schema/tables/case.table';
import type { OutboxStatus } from '../db/schema/tables/outbox.table';
import type { SignalName } from '../scoring/signals';
import { threadUrl } from './links';

export type QueueTab = 'review' | 'blocked' | 'dismissed';

export interface QueueEntry {
	caseId: number;
	login: string;
	score: number;
	state: CaseState;
	lastSeen: Date;
	signals: Partial<Record<SignalName, number>>;
	latestComment: { body: string; url: string; createdAt: Date } | null;
	/** For blocked accounts, whether the latest block has been carried out on GitHub. */
	blockStatus: OutboxStatus | null;
}

export interface QueueCounts {
	review: number;
	blocked: number;
	dismissed: number;
}

export async function queueCounts(db: Db, installationId: number): Promise<QueueCounts> {
	const rows = await db
		.selectFrom('cases')
		.select(['state', 'score'])
		.where('installation_id', '=', installationId)
		.execute();
	return {
		review: rows.filter((r) => r.state === 'open' && r.score >= QUEUE_THRESHOLD).length,
		blocked: rows.filter((r) => r.state === 'blocked').length,
		dismissed: rows.filter((r) => r.state === 'dismissed').length
	};
}

export async function listQueue(
	db: Db,
	installation: { id: number; accountId: number },
	tab: QueueTab
): Promise<QueueEntry[]> {
	let query = db
		.selectFrom('cases')
		.innerJoin('github_users', 'github_users.id', 'cases.user_id')
		.select([
			'cases.id',
			'cases.user_id',
			'cases.score',
			'cases.state',
			'cases.last_seen_at',
			'github_users.login'
		])
		.where('cases.installation_id', '=', installation.id);
	query =
		tab === 'review'
			? query
					.where('cases.state', '=', 'open')
					.where('cases.score', '>=', QUEUE_THRESHOLD)
					.orderBy('cases.score', 'desc')
					.orderBy('cases.last_seen_at', 'desc')
			: query
					.where('cases.state', '=', tab === 'blocked' ? 'blocked' : 'dismissed')
					.orderBy('cases.last_seen_at', 'desc');
	const cases = await query.execute();
	if (cases.length === 0) {
		return [];
	}
	const userIds = cases.map((c) => c.user_id);

	const signalRows = await db
		.selectFrom('signal_values')
		.innerJoin('evaluations', 'evaluations.id', 'signal_values.evaluation_id')
		.select(['evaluations.user_id', 'signal_values.signal_name', 'signal_values.value'])
		.where(
			'evaluations.id',
			'in',
			db
				.selectFrom('evaluations')
				.select((eb) => eb.fn.max('id').as('id'))
				.where('user_id', 'in', userIds)
				.groupBy('user_id')
		)
		.execute();

	const latest = await db
		.selectFrom('comments')
		.innerJoin('threads', 'threads.id', 'comments.thread_id')
		.innerJoin('repositories', 'repositories.id', 'threads.repository_id')
		.distinctOn('comments.author_id')
		.select([
			'comments.author_id',
			'comments.body',
			'comments.created_at',
			'threads.kind',
			'threads.number',
			'repositories.owner_login',
			'repositories.name'
		])
		.where('comments.author_id', 'in', userIds)
		.where('repositories.owner_id', '=', installation.accountId)
		.orderBy('comments.author_id')
		.orderBy('comments.created_at', 'desc')
		.execute();

	const blocks =
		tab === 'blocked'
			? await db
					.selectFrom('outbox')
					.innerJoin('decisions', 'decisions.id', 'outbox.decision_id')
					.distinctOn('decisions.case_id')
					.select(['decisions.case_id', 'outbox.status'])
					.where(
						'decisions.case_id',
						'in',
						cases.map((c) => c.id)
					)
					.where('outbox.action', '=', 'block_user')
					.orderBy('decisions.case_id')
					.orderBy('outbox.id', 'desc')
					.execute()
			: [];

	return cases.map((c) => {
		const comment = latest.find((l) => l.author_id === c.user_id);
		return {
			caseId: c.id,
			login: c.login,
			score: c.score,
			state: c.state,
			lastSeen: new Date(c.last_seen_at),
			signals: Object.fromEntries(
				signalRows.filter((s) => s.user_id === c.user_id).map((s) => [s.signal_name, s.value])
			),
			latestComment: comment
				? {
						body: comment.body,
						url: threadUrl(comment.owner_login, comment.name, comment.kind, comment.number),
						createdAt: new Date(comment.created_at)
					}
				: null,
			blockStatus: blocks.find((b) => b.case_id === c.id)?.status ?? null
		};
	});
}

/** The account to show after deciding on `afterCaseId`: the next one in the review queue. */
export async function nextToReview(
	db: Db,
	installation: { id: number; accountId: number },
	afterCaseId: number
): Promise<string | null> {
	const queue = await listQueue(db, installation, 'review');
	return queue.find((entry) => entry.caseId !== afterCaseId)?.login ?? null;
}
