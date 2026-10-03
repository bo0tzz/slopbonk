import type { Db } from '../db';
import type { AccountType } from '../db/schema/tables/installation.table';

/** An installation, an account with `comments` comments in the installation's repository, and its case. */
export async function seedCase(
	db: Db,
	{
		installationId,
		accountType = 'Organization',
		userId,
		comments = 2
	}: { installationId: number; accountType?: AccountType; userId: number; comments?: number }
): Promise<number> {
	const orgId = installationId * 10;
	await db
		.insertInto('installations')
		.values({
			id: installationId,
			account_id: orgId,
			account_login: `org-${orgId}`,
			account_type: accountType
		})
		.onConflict((oc) => oc.column('id').doNothing())
		.execute();
	await db
		.insertInto('github_users')
		.values({ id: userId, login: `user-${userId}` })
		.execute();
	const repoId = orgId + 1;
	await db
		.insertInto('repositories')
		.values({
			id: repoId,
			node_id: `R_${repoId}`,
			owner_id: orgId,
			owner_login: `org-${orgId}`,
			name: 'repo'
		})
		.onConflict((oc) => oc.column('id').doNothing())
		.execute();
	const threadId = `D_${userId}`;
	await db
		.insertInto('threads')
		.values({
			id: threadId,
			repository_id: repoId,
			kind: 'discussion',
			number: 1,
			author_id: null,
			category_name: 'Q&A',
			category_answerable: true,
			created_at: new Date()
		})
		.execute();
	for (let i = 0; i < comments; i++) {
		await db
			.insertInto('comments')
			.values({
				id: `C_${userId}_${i}`,
				author_id: userId,
				thread_id: threadId,
				author_association: 'NONE',
				body: 'answer',
				created_at: new Date(),
				source: 'webhook'
			})
			.execute();
	}
	const { id } = await db
		.insertInto('cases')
		.values({
			installation_id: installationId,
			user_id: userId,
			score: 4,
			first_seen_at: new Date(),
			last_seen_at: new Date()
		})
		.returning('id')
		.executeTakeFirstOrThrow();
	return id;
}
