import type { Db } from '../db';
import { HISTORY_FRESHNESS_MS, HISTORY_HORIZON_MS } from '../constants';
import type {
	DiscussionCommentNode,
	GithubClient,
	HistoryPage,
	IssueCommentNode
} from '../github/reads';
import { repositoryRecord, storeComment, storeRepository, storeThread } from './store';

/** Overlap with the previous fetch, so comments posted while it ran aren't missed. */
const INCREMENTAL_OVERLAP_MS = 24 * 60 * 60 * 1000;

export type FetchResult = 'fresh' | 'fetched' | 'gone';

export async function fetchHistory(
	db: Db,
	client: GithubClient,
	userId: number,
	now = new Date()
): Promise<FetchResult> {
	const tracked = await db
		.selectFrom('tracked_users')
		.selectAll()
		.where('user_id', '=', userId)
		.executeTakeFirst();
	const lastFetched = tracked?.last_fetched_at ? new Date(tracked.last_fetched_at) : null;
	if (lastFetched && now.getTime() - lastFetched.getTime() < HISTORY_FRESHNESS_MS) {
		return 'fresh';
	}

	const profile = await client.getUser(userId);
	if (!profile) {
		await db
			.insertInto('tracked_users')
			.values({ user_id: userId, gone_at: now })
			.onConflict((oc) => oc.column('user_id').doUpdateSet({ gone_at: now }))
			.execute();
		return 'gone';
	}

	const user = {
		node_id: profile.node_id,
		login: profile.login,
		account_created_at: profile.created_at,
		name: profile.name,
		bio: profile.bio,
		followers: profile.followers,
		updated_at: now
	};
	await db
		.insertInto('github_users')
		.values({ id: userId, ...user })
		.onConflict((oc) => oc.column('id').doUpdateSet(user))
		.execute();

	const cutoff = lastFetched
		? new Date(lastFetched.getTime() - INCREMENTAL_OVERLAP_MS)
		: new Date(now.getTime() - HISTORY_HORIZON_MS);

	if (profile.type === 'User') {
		await collect(
			(cursor) => client.discussionComments(profile.login, cursor),
			cutoff,
			(node) => storeDiscussionComment(db, userId, node)
		);
		await collect(
			(cursor) => client.issueComments(profile.login, cursor),
			cutoff,
			(node) => storeIssueComment(db, userId, node)
		);
	}

	const historyFrom = tracked?.history_from ?? cutoff;
	await db
		.insertInto('tracked_users')
		.values({ user_id: userId, last_fetched_at: now, history_from: historyFrom, gone_at: null })
		.onConflict((oc) =>
			oc
				.column('user_id')
				.doUpdateSet({ last_fetched_at: now, history_from: historyFrom, gone_at: null })
		)
		.execute();
	return 'fetched';
}

async function collect<T extends { createdAt: string }>(
	fetchPage: (cursor: string | null) => Promise<HistoryPage<T>>,
	cutoff: Date,
	store: (node: T) => Promise<void>
) {
	let cursor: string | null = null;
	for (;;) {
		const page = await fetchPage(cursor);
		for (const node of page.nodes) {
			if (new Date(node.createdAt) < cutoff) {
				return;
			}
			await store(node);
		}
		if (!page.hasOlder) {
			return;
		}
		cursor = page.cursor;
	}
}

async function storeDiscussionComment(db: Db, userId: number, node: DiscussionCommentNode) {
	const discussion = node.discussion;
	const repository = discussion && repositoryRecord(discussion.repository);
	if (!discussion || !repository) {
		return;
	}
	await storeRepository(db, repository);
	await storeThread(db, {
		id: discussion.id,
		repository_id: repository.id,
		kind: 'discussion',
		number: discussion.number,
		author_id: discussion.author?.databaseId ?? null,
		category_name: discussion.category.name,
		category_answerable: discussion.category.isAnswerable,
		created_at: discussion.createdAt
	});
	await storeComment(db, {
		id: node.id,
		author_id: userId,
		thread_id: discussion.id,
		author_association: node.authorAssociation,
		is_answer: node.isAnswer,
		body: node.body,
		created_at: node.createdAt,
		edited_at: node.lastEditedAt,
		source: 'history'
	});
}

async function storeIssueComment(db: Db, userId: number, node: IssueCommentNode) {
	const thread = node.pullRequest ?? node.issue;
	const repository = node.repository && repositoryRecord(node.repository);
	if (!thread || !repository) {
		return;
	}
	await storeRepository(db, repository);
	await storeThread(db, {
		id: thread.id,
		repository_id: repository.id,
		kind: node.pullRequest ? 'pull_request' : 'issue',
		number: thread.number,
		author_id: thread.author?.databaseId ?? null,
		category_name: null,
		category_answerable: false,
		created_at: thread.createdAt
	});
	await storeComment(db, {
		id: node.id,
		author_id: userId,
		thread_id: thread.id,
		author_association: node.authorAssociation,
		is_answer: false,
		body: node.body,
		created_at: node.createdAt,
		edited_at: node.lastEditedAt,
		source: 'history'
	});
}
