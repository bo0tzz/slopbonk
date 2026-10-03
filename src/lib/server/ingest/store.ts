import type { Db } from '../db';
import type { RepositoryNode } from '../github/client';
import type { CommentSource } from '../db/schema/tables/comment.table';
import type { ThreadKind } from '../db/schema/tables/thread.table';

export interface RepositoryRecord {
	id: number;
	node_id: string;
	owner_id: number;
	owner_login: string;
	name: string;
}

export interface ThreadRecord {
	id: string;
	repository_id: number;
	kind: ThreadKind;
	number: number;
	author_id: number | null;
	category_name: string | null;
	category_answerable: boolean;
	created_at: string;
}

export interface CommentRecord {
	id: string;
	author_id: number;
	thread_id: string;
	author_association: string;
	is_answer: boolean;
	body: string;
	created_at: string;
	edited_at: string | null;
	source: CommentSource;
}

export function repositoryRecord(repository: RepositoryNode): RepositoryRecord | null {
	if (repository.owner.databaseId === undefined) {
		return null;
	}
	return {
		id: repository.databaseId,
		node_id: repository.id,
		owner_id: repository.owner.databaseId,
		owner_login: repository.owner.login,
		name: repository.name
	};
}

export async function storeUser(
	db: Db,
	user: { id: number; node_id: string | undefined; login: string }
) {
	await db
		.insertInto('github_users')
		.values(user)
		.onConflict((oc) => oc.column('id').doUpdateSet({ login: user.login }))
		.execute();
}

export async function storeRepository(db: Db, repository: RepositoryRecord) {
	await db
		.insertInto('repositories')
		.values(repository)
		.onConflict((oc) =>
			oc.column('id').doUpdateSet({ owner_login: repository.owner_login, name: repository.name })
		)
		.execute();
}

export async function storeThread(db: Db, thread: ThreadRecord) {
	await db
		.insertInto('threads')
		.values(thread)
		.onConflict((oc) =>
			oc.column('id').doUpdateSet({
				category_name: thread.category_name,
				category_answerable: thread.category_answerable
			})
		)
		.execute();
}

/** A comment seen again keeps its original source, but its text and answer state are refreshed. */
export async function storeComment(db: Db, comment: CommentRecord) {
	await db
		.insertInto('comments')
		.values(comment)
		.onConflict((oc) =>
			oc.column('id').doUpdateSet({
				body: comment.body,
				edited_at: comment.edited_at,
				is_answer: comment.is_answer,
				author_association: comment.author_association
			})
		)
		.execute();
}
