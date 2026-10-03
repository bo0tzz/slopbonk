import type { Db } from '../db';
import { outboxQueue } from '../jobs';
import type { JobSender } from '../queue';

export type ReviewAction = 'block' | 'dismiss';

export interface DecisionInput {
	/** The installation the reviewer is acting in; the case must belong to it. */
	installationId: number;
	caseId: number;
	/** The reviewer's GitHub user id. */
	actorId: number;
	action: ReviewAction;
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

		const { id: decisionId } = await tx
			.insertInto('decisions')
			.values({
				case_id: input.caseId,
				actor_id: input.actorId,
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

		const outbox =
			input.action === 'block'
				? await tx
						.insertInto('outbox')
						.values({
							decision_id: decisionId,
							installation_id: target.installation_id,
							action: 'block_user',
							target_user_id: target.user_id
						})
						.returning('id')
						.execute()
				: [];
		return { decisionId, outboxIds: outbox.map((row) => row.id) };
	});

	for (const outboxId of result.outboxIds) {
		await queue.send(outboxQueue, { outboxId }, { singletonKey: String(outboxId) });
	}
	return result;
}
