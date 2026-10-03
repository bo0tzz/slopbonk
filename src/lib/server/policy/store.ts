import type { Db } from '../db';
import type { SignalValue, ActivityComment } from './signals';

export function findInstallation(db: Db, installationId: number) {
	return db
		.selectFrom('installations')
		.select(['account_id', 'uninstalled_at'])
		.where('id', '=', installationId)
		.executeTakeFirst();
}

/** The account's comments in repositories owned by the installation's account, oldest first. */
export function findTenantComments(db: Db, userId: number, accountId: number) {
	return db
		.selectFrom('comments')
		.innerJoin('threads', 'threads.id', 'comments.thread_id')
		.innerJoin('repositories', 'repositories.id', 'threads.repository_id')
		.select(['comments.created_at', 'comments.author_association'])
		.where('comments.author_id', '=', userId)
		.where('repositories.owner_id', '=', accountId)
		.orderBy('comments.created_at')
		.execute();
}

export function findTracking(db: Db, userId: number) {
	return db
		.selectFrom('tracked_users')
		.select(['last_fetched_at', 'gone_at'])
		.where('user_id', '=', userId)
		.executeTakeFirst();
}

export async function findActivity(
	db: Db,
	userId: number,
	since: Date
): Promise<ActivityComment[]> {
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
		.where('comments.created_at', '>=', since)
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

export interface EvaluationRecord {
	userId: number;
	evaluatedAt: Date;
	rulesetVersion: string;
	dataAsOf: Date;
	signals: SignalValue[];
}

export interface CaseUpdate {
	installationId: number;
	userId: number;
	score: number;
	firstSeen: Date;
	lastSeen: Date;
	/** Reopen a dismissed case when the score reaches the dismissed score plus this. */
	reopenMargin: number;
}

/** Stores the evaluation and creates or updates the case, in one transaction. */
export function saveEvaluation(db: Db, evaluation: EvaluationRecord, update: CaseUpdate) {
	return db.transaction().execute(async (tx) => {
		const { id: evaluationId } = await tx
			.insertInto('evaluations')
			.values({
				user_id: evaluation.userId,
				evaluated_at: evaluation.evaluatedAt,
				ruleset_version: evaluation.rulesetVersion,
				data_as_of: evaluation.dataAsOf
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		await tx
			.insertInto('signal_values')
			.values(
				evaluation.signals.map((s) => ({
					evaluation_id: evaluationId,
					signal_name: s.name,
					signal_version: s.version,
					value: s.value
				}))
			)
			.execute();

		const existing = await tx
			.selectFrom('cases')
			.select(['id', 'state', 'dismissed_score'])
			.where('installation_id', '=', update.installationId)
			.where('user_id', '=', update.userId)
			.executeTakeFirst();

		if (!existing) {
			const { id } = await tx
				.insertInto('cases')
				.values({
					installation_id: update.installationId,
					user_id: update.userId,
					score: update.score,
					first_seen_at: update.firstSeen,
					last_seen_at: update.lastSeen
				})
				.returning('id')
				.executeTakeFirstOrThrow();
			return { caseId: id, created: true };
		}

		const reopen =
			existing.state === 'dismissed' &&
			existing.dismissed_score !== null &&
			update.score >= existing.dismissed_score + update.reopenMargin;
		await tx
			.updateTable('cases')
			.set({
				score: update.score,
				last_seen_at: update.lastSeen,
				...(reopen ? { state: 'open' as const } : {})
			})
			.where('id', '=', existing.id)
			.execute();
		return { caseId: existing.id, created: false };
	});
}
