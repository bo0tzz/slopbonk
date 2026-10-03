import type { Db } from '../db';
import type { GithubActions } from '../github/actions';
import { RateLimitedError } from '../github/rate-limit';
import { outboxQueue } from '../jobs';
import type { JobSender } from '../queue';

export class PermanentActionError extends Error {}

/**
 * Carries out one outbox item. Throws to let the queue retry; the item is only marked failed on the
 * final attempt, or immediately when retrying can't help.
 */
export async function carryOut(
	db: Db,
	actionsFor: (installationId: number) => Promise<GithubActions>,
	outboxId: number,
	finalAttempt: boolean,
	now = new Date()
): Promise<void> {
	const item = await db
		.selectFrom('outbox')
		.innerJoin('installations', 'installations.id', 'outbox.installation_id')
		.leftJoin('github_users', 'github_users.id', 'outbox.target_user_id')
		.select([
			'outbox.status',
			'outbox.action',
			'outbox.installation_id',
			'outbox.comment_id',
			'installations.account_login',
			'installations.account_type',
			'github_users.login'
		])
		.where('outbox.id', '=', outboxId)
		.executeTakeFirst();
	if (!item || item.status !== 'pending') {
		return;
	}

	try {
		const actions = await actionsFor(item.installation_id);
		switch (item.action) {
			case 'block_user':
				if (item.account_type !== 'Organization') {
					throw new PermanentActionError('Only organisations can block accounts through an app.');
				}
				if (!item.login) {
					throw new PermanentActionError('The target account is unknown.');
				}
				await actions.blockUser(item.account_login, item.login);
				break;
			case 'minimize_comment':
				if (!item.comment_id) {
					throw new PermanentActionError('No comment to hide.');
				}
				await actions.minimizeComment(item.comment_id);
				break;
		}
	} catch (error) {
		if (error instanceof RateLimitedError) {
			throw error;
		}
		const permanent = error instanceof PermanentActionError;
		await db
			.updateTable('outbox')
			.set((eb) => ({
				attempts: eb('attempts', '+', 1),
				last_error: error instanceof Error ? error.message : String(error),
				...(permanent || finalAttempt ? { status: 'failed' as const, completed_at: now } : {})
			}))
			.where('id', '=', outboxId)
			.execute();
		if (permanent) {
			return;
		}
		throw error;
	}

	await db
		.updateTable('outbox')
		.set((eb) => ({ status: 'done', completed_at: now, attempts: eb('attempts', '+', 1) }))
		.where('id', '=', outboxId)
		.execute();
}

/** Queues every pending item, e.g. after a crash between recording a decision and queueing it. */
export async function requeuePending(db: Db, queue: JobSender): Promise<void> {
	const pending = await db
		.selectFrom('outbox')
		.select(['id', 'installation_id'])
		.where('status', '=', 'pending')
		.execute();
	for (const { id, installation_id } of pending) {
		await queue.send(
			outboxQueue,
			{ installationId: installation_id, outboxId: id },
			{ singletonKey: String(id) }
		);
	}
}
