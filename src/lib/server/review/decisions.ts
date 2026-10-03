import type { Db } from '../db';
import { outboxQueue, type GithubBlockChange } from '../jobs';
import type { JobSender } from '../queue';

export type ReviewAction = 'block' | 'dismiss';

export interface DecisionInput {
	/** The installation the reviewer is acting in; the case must belong to it. */
	installationId: number;
	caseId: number;
	/** The reviewer; their account row is restored if retention removed it since they signed in. */
	actor: { id: number; login: string };
	action: ReviewAction;
	hideComments?: boolean;
	reason?: string;
	/** The evaluation the reviewer was looking at; defaults to the account's latest. */
	evaluationId?: number;
}

export class DecisionError extends Error {}

export async function recordDecision(
	db: Db,
	queue: JobSender,
	input: DecisionInput
): Promise<{ decisionId: number; outboxIds: number[] }> {
	const result = await db.transaction().execute(async (tx) => {
		const target = await tx
			.selectFrom('cases')
			.innerJoin('installations', 'installations.id', 'cases.installation_id')
			.select([
				'cases.user_id',
				'cases.score',
				'cases.installation_id',
				'installations.account_id',
				'installations.account_type'
			])
			.where('cases.id', '=', input.caseId)
			.executeTakeFirst();
		if (!target || target.installation_id !== input.installationId) {
			throw new DecisionError('No such case.');
		}
		if (input.action === 'block' && target.account_type !== 'Organization') {
			throw new DecisionError('Only organisations can block accounts through an app.');
		}

		const evaluationId =
			input.evaluationId ??
			(
				await tx
					.selectFrom('evaluations')
					.select('id')
					.where('user_id', '=', target.user_id)
					.orderBy('evaluated_at', 'desc')
					.limit(1)
					.executeTakeFirst()
			)?.id ??
			null;

		await tx
			.insertInto('github_users')
			.values(input.actor)
			.onConflict((oc) => oc.column('id').doNothing())
			.execute();
		const { id: decisionId } = await tx
			.insertInto('decisions')
			.values({
				case_id: input.caseId,
				actor_id: input.actor.id,
				action: input.action,
				reason: input.reason ?? null,
				evaluation_id: evaluationId
			})
			.returning('id')
			.executeTakeFirstOrThrow();

		await tx
			.updateTable('cases')
			.set(
				input.action === 'block'
					? { state: 'blocked' }
					: { state: 'dismissed', dismissed_score: target.score }
			)
			.where('id', '=', input.caseId)
			.execute();

		const outbox = [];
		if (input.action === 'block') {
			const base = {
				decision_id: decisionId,
				installation_id: target.installation_id,
				target_user_id: target.user_id
			};
			const comments = input.hideComments
				? await tx
						.selectFrom('comments')
						.innerJoin('threads', 'threads.id', 'comments.thread_id')
						.innerJoin('repositories', 'repositories.id', 'threads.repository_id')
						.select('comments.id')
						.where('comments.author_id', '=', target.user_id)
						.where('repositories.owner_id', '=', target.account_id)
						.execute()
				: [];
			outbox.push(
				...(await tx
					.insertInto('outbox')
					.values([
						{ ...base, action: 'block_user' as const },
						...comments.map((comment) => ({
							...base,
							action: 'minimize_comment' as const,
							comment_id: comment.id
						}))
					])
					.returning('id')
					.execute())
			);
		}
		return {
			decisionId,
			installationId: target.installation_id,
			outboxIds: outbox.map((row) => row.id)
		};
	});

	for (const outboxId of result.outboxIds) {
		await queue.send(
			outboxQueue,
			{ installationId: result.installationId, outboxId },
			{ singletonKey: String(outboxId) }
		);
	}
	return { decisionId: result.decisionId, outboxIds: result.outboxIds };
}

/**
 * Brings a flagged account's case in line with a block or unblock made on GitHub, recording it as
 * that maintainer's decision. An unblock counts as a dismissal.
 */
export async function recordGithubBlockChange(db: Db, change: GithubBlockChange): Promise<void> {
	await db.transaction().execute(async (tx) => {
		const found = await tx
			.selectFrom('cases')
			.select(['id', 'state', 'score'])
			.where('installation_id', '=', change.installationId)
			.where('user_id', '=', change.userId)
			.executeTakeFirst();
		const blocked = found?.state === 'blocked';
		if (!found || blocked === (change.action === 'block')) {
			return;
		}
		await tx
			.insertInto('github_users')
			.values(change.actor)
			.onConflict((oc) => oc.column('id').doNothing())
			.execute();
		await tx
			.insertInto('decisions')
			.values({
				case_id: found.id,
				actor_id: change.actor.id,
				action: change.action,
				reason: change.action === 'block' ? 'Blocked on GitHub' : 'Unblocked on GitHub'
			})
			.execute();
		await tx
			.updateTable('cases')
			.set(
				change.action === 'block'
					? { state: 'blocked' }
					: { state: 'dismissed', dismissed_score: found.score }
			)
			.where('id', '=', found.id)
			.execute();
	});
}
