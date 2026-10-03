import type { Db } from '../db';
import {
	EXEMPT_ASSOCIATIONS,
	HISTORY_FRESHNESS_MS,
	HISTORY_HORIZON_MS,
	RECHECK_OFFSETS_MS,
	REOPEN_SCORE_MARGIN
} from '../constants';
import { evaluateQueue, fetchHistoryQueue, jobKey, type AccountInInstallation } from '../jobs';
import type { JobQueue } from '../queue';
import { RULESET, score, type Ruleset } from './rules';
import { computeSignals, type ActivityComment } from './signals';

type Queue = Pick<JobQueue, 'send'>;

export type EvaluateResult =
	'skipped' | 'exempt' | 'awaiting-history' | 'gone' | { score: number; caseId: number };

export async function evaluate(
	db: Db,
	queue: Queue,
	job: AccountInInstallation,
	now = new Date(),
	ruleset: Ruleset = RULESET
): Promise<EvaluateResult> {
	const installation = await db
		.selectFrom('installations')
		.select(['account_id', 'uninstalled_at'])
		.where('id', '=', job.installationId)
		.executeTakeFirst();
	if (!installation || installation.uninstalled_at) {
		return 'skipped';
	}

	const tenantComments = await db
		.selectFrom('comments')
		.innerJoin('threads', 'threads.id', 'comments.thread_id')
		.innerJoin('repositories', 'repositories.id', 'threads.repository_id')
		.select(['comments.created_at', 'comments.author_association'])
		.where('comments.author_id', '=', job.userId)
		.where('repositories.owner_id', '=', installation.account_id)
		.orderBy('comments.created_at')
		.execute();
	if (tenantComments.length === 0) {
		return 'skipped';
	}
	if (tenantComments.some((c) => EXEMPT_ASSOCIATIONS.includes(c.author_association))) {
		return 'exempt';
	}

	const tracked = await db
		.selectFrom('tracked_users')
		.select(['last_fetched_at', 'gone_at'])
		.where('user_id', '=', job.userId)
		.executeTakeFirst();
	if (tracked?.gone_at) {
		return 'gone';
	}
	const lastFetched = tracked?.last_fetched_at ? new Date(tracked.last_fetched_at) : null;
	if (!lastFetched || now.getTime() - lastFetched.getTime() >= HISTORY_FRESHNESS_MS) {
		await queue.send(fetchHistoryQueue, job, { singletonKey: jobKey(job) });
		return 'awaiting-history';
	}

	const signals = computeSignals(job.userId, await activity(db, job.userId, now));
	const result = score(ruleset, signals);

	const outcome = await db.transaction().execute(async (tx) => {
		const evaluation = await tx
			.insertInto('evaluations')
			.values({
				user_id: job.userId,
				evaluated_at: now,
				ruleset_version: ruleset.version,
				data_as_of: lastFetched
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		await tx
			.insertInto('signal_values')
			.values(
				signals.map((s) => ({
					evaluation_id: evaluation.id,
					signal_name: s.name,
					signal_version: s.version,
					value: s.value
				}))
			)
			.execute();

		const firstSeen = tenantComments[0].created_at;
		const lastSeen = tenantComments[tenantComments.length - 1].created_at;
		const existing = await tx
			.selectFrom('cases')
			.select(['id', 'state', 'dismissed_score'])
			.where('installation_id', '=', job.installationId)
			.where('user_id', '=', job.userId)
			.executeTakeFirst();

		if (!existing) {
			const created = await tx
				.insertInto('cases')
				.values({
					installation_id: job.installationId,
					user_id: job.userId,
					score: result.total,
					first_seen_at: firstSeen,
					last_seen_at: lastSeen
				})
				.returning('id')
				.executeTakeFirstOrThrow();
			return { caseId: created.id, created: true };
		}

		const reopen =
			existing.state === 'dismissed' &&
			existing.dismissed_score !== null &&
			result.total >= existing.dismissed_score + REOPEN_SCORE_MARGIN;
		await tx
			.updateTable('cases')
			.set({
				score: result.total,
				last_seen_at: lastSeen,
				...(reopen ? { state: 'open' as const } : {})
			})
			.where('id', '=', existing.id)
			.execute();
		return { caseId: existing.id, created: false };
	});

	if (outcome.created) {
		await scheduleRechecks(queue, job, now);
	}
	return { score: result.total, caseId: outcome.caseId };
}

async function activity(db: Db, userId: number, now: Date): Promise<ActivityComment[]> {
	const rows = await db
		.selectFrom('comments')
		.innerJoin('threads', 'threads.id', 'comments.thread_id')
		.innerJoin('repositories', 'repositories.id', 'threads.repository_id')
		.select([
			'comments.created_at',
			'comments.author_association',
			'threads.repository_id',
			'threads.author_id',
			'threads.category_answerable',
			'repositories.owner_id'
		])
		.where('comments.author_id', '=', userId)
		.where('comments.created_at', '>=', new Date(now.getTime() - HISTORY_HORIZON_MS))
		.execute();
	return rows.map((row) => ({
		createdAt: new Date(row.created_at),
		repositoryId: row.repository_id,
		repositoryOwnerId: row.owner_id,
		threadAuthorId: row.author_id,
		authorAssociation: row.author_association,
		answerable: row.category_answerable
	}));
}

/** Each re-check gets its own key: a shared key would let the queue drop all but the first. */
async function scheduleRechecks(queue: Queue, job: AccountInInstallation, now: Date) {
	for (const offset of RECHECK_OFFSETS_MS) {
		await queue.send(evaluateQueue, job, {
			singletonKey: `${jobKey(job)}:recheck:${offset}`,
			startAfter: new Date(now.getTime() + offset)
		});
	}
}
