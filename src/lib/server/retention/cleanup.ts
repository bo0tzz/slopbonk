import { sql, type ExpressionBuilder } from 'kysely';
import { RETENTION } from '../constants';
import type { Db } from '../db';
import type { DB } from '../db/schema';

export interface CleanupResult {
	uninstalledTenants: number;
	historyComments: number;
	threads: number;
	repositories: number;
	evaluations: number;
	accounts: number;
}

/** Applies ADR-0004's retention rules. Safe to run at any time; each step only removes expired data. */
export async function cleanUp(db: Db, now = new Date()): Promise<CleanupResult> {
	const before = (ms: number) => new Date(now.getTime() - ms);

	return db.transaction().execute(async (tx) => {
		// Cascades to the tenant's cases, decisions, outbox and configuration changes.
		const uninstalledTenants = await tx
			.deleteFrom('installations')
			.where('uninstalled_at', '<', before(RETENTION.uninstalledTenantMs))
			.executeTakeFirst();

		const tenantRepository = (eb: ExpressionBuilder<DB, 'repositories'>) =>
			eb.exists(
				eb
					.selectFrom('installations')
					.select(sql`1`.as('one'))
					.whereRef('installations.account_id', '=', 'repositories.owner_id')
					.where('installations.uninstalled_at', 'is', null)
			);

		const historyCutoff = before(RETENTION.unflaggedHistoryMs);
		const history = await tx
			.deleteFrom('comments')
			.using(['threads', 'repositories'])
			.whereRef('threads.id', '=', 'comments.thread_id')
			.whereRef('repositories.id', '=', 'threads.repository_id')
			.where('comments.fetched_at', '<', historyCutoff)
			.where((eb) => eb.not(tenantRepository(eb)))
			.where(({ exists, not, selectFrom }) =>
				not(
					exists(
						selectFrom('cases')
							.select(sql`1`.as('one'))
							.whereRef('cases.user_id', '=', 'comments.author_id')
							.where('cases.state', 'in', ['open', 'blocked'])
					)
				)
			)
			.where(({ exists, not, selectFrom }) =>
				not(
					exists(
						selectFrom('evaluations')
							.select(sql`1`.as('one'))
							.whereRef('evaluations.user_id', '=', 'comments.author_id')
							.where('evaluations.evaluated_at', '>=', historyCutoff)
					)
				)
			)
			.returning('comments.author_id')
			.execute();

		// With part of its history gone, an account's next fetch has to start over rather than
		// continue from the last one.
		const pruned = [...new Set(history.map((row) => row.author_id))];
		if (pruned.length > 0) {
			await tx.deleteFrom('tracked_users').where('user_id', 'in', pruned).execute();
		}

		// The backfill stores these before the comments that will refer to them.
		const threads = await tx
			.deleteFrom('threads')
			.where(({ exists, not, selectFrom }) =>
				not(
					exists(
						selectFrom('comments')
							.select(sql`1`.as('one'))
							.whereRef('comments.thread_id', '=', 'threads.id')
					)
				)
			)
			.where(({ exists, not, selectFrom }) =>
				not(
					exists(
						selectFrom('repositories')
							.select(sql`1`.as('one'))
							.whereRef('repositories.id', '=', 'threads.repository_id')
							.where(tenantRepository)
					)
				)
			)
			.executeTakeFirst();

		const repositories = await tx
			.deleteFrom('repositories')
			.where(({ exists, not, selectFrom }) =>
				not(
					exists(
						selectFrom('threads')
							.select(sql`1`.as('one'))
							.whereRef('threads.repository_id', '=', 'repositories.id')
					)
				)
			)
			.where((eb) => eb.not(tenantRepository(eb)))
			.executeTakeFirst();

		// Unlabelled evaluations expire sooner, except the latest one of an account still awaiting
		// review, which its account page shows. Decisions keep their row when theirs expires.
		const evaluations = await tx
			.deleteFrom('evaluations')
			.where((eb) =>
				eb.or([
					eb('evaluations.evaluated_at', '<', before(RETENTION.labelledEvaluationsMs)),
					eb.and([
						eb('evaluations.evaluated_at', '<', before(RETENTION.unlabelledEvaluationsMs)),
						eb.not(
							eb.exists(
								eb
									.selectFrom('decisions')
									.select(sql`1`.as('one'))
									.whereRef('decisions.evaluation_id', '=', 'evaluations.id')
							)
						),
						eb.or([
							eb.not(
								eb.exists(
									eb
										.selectFrom('cases')
										.select(sql`1`.as('one'))
										.whereRef('cases.user_id', '=', 'evaluations.user_id')
										.where('cases.state', '=', 'open')
								)
							),
							eb(
								'evaluations.id',
								'<',
								eb
									.selectFrom('evaluations as latest')
									.select((latest) => latest.fn.max('latest.id').as('id'))
									.whereRef('latest.user_id', '=', 'evaluations.user_id')
							)
						])
					])
				])
			)
			.executeTakeFirst();

		// Accounts nothing refers to any more. The grace period covers rows that work in flight is
		// about to reference.
		const accounts = await tx
			.deleteFrom('github_users')
			.where('github_users.updated_at', '<', historyCutoff)
			.where(({ exists, not, selectFrom, or }) =>
				not(
					or([
						exists(
							selectFrom('comments')
								.select(sql`1`.as('one'))
								.whereRef('comments.author_id', '=', 'github_users.id')
						),
						exists(
							selectFrom('cases')
								.select(sql`1`.as('one'))
								.whereRef('cases.user_id', '=', 'github_users.id')
						),
						exists(
							selectFrom('evaluations')
								.select(sql`1`.as('one'))
								.whereRef('evaluations.user_id', '=', 'github_users.id')
						),
						exists(
							selectFrom('decisions')
								.select(sql`1`.as('one'))
								.whereRef('decisions.actor_id', '=', 'github_users.id')
						),
						exists(
							selectFrom('config_changes')
								.select(sql`1`.as('one'))
								.whereRef('config_changes.actor_id', '=', 'github_users.id')
						)
					])
				)
			)
			.executeTakeFirst();

		return {
			uninstalledTenants: Number(uninstalledTenants.numDeletedRows),
			historyComments: history.length,
			threads: Number(threads.numDeletedRows),
			repositories: Number(repositories.numDeletedRows),
			evaluations: Number(evaluations.numDeletedRows),
			accounts: Number(accounts.numDeletedRows)
		};
	});
}
