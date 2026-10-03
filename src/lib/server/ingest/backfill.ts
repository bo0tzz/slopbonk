import type { Db } from '../db';
import { INSTALL_BACKFILL_MS } from '../constants';
import type { CommentPage, GithubClient, RecentComment } from '../github/reads';
import {
	backfillCommentsKey,
	backfillCommentsQueue,
	backfillPageKey,
	backfillPageQueue,
	evaluateQueue,
	jobKey,
	type BackfillComments,
	type BackfillJob,
	type BackfillPage
} from '../jobs';
import type { JobSender } from '../queue';
import { repositoryRecord, storeComment, storeRepository, storeThread, storeUser } from './store';

const THREAD_KINDS: BackfillPage['kind'][] = ['discussion', 'issue', 'pull_request'];

/** Queues the first page of every kind of thread in each of the installation's repositories. */
export async function startBackfill(
	db: Db,
	queue: JobSender,
	client: GithubClient,
	{ installationId, repositoryIds }: BackfillJob,
	now = new Date()
): Promise<number> {
	const since = new Date(now.getTime() - INSTALL_BACKFILL_MS).toISOString();
	let queued = 0;
	for (const repository of await client.installationRepositories()) {
		const record = repositoryRecord(repository);
		if (!record || (repositoryIds && !repositoryIds.includes(record.id))) {
			continue;
		}
		await storeRepository(db, record);
		for (const kind of THREAD_KINDS) {
			const job: BackfillPage = {
				installationId,
				repository: { id: record.id, owner: record.owner_login, name: record.name },
				kind,
				cursor: null,
				since
			};
			await queue.send(backfillPageQueue, job, { singletonKey: backfillPageKey(job) });
			queued++;
		}
	}
	return queued;
}

/**
 * Stores one page of recently updated threads with the comments they include from inside the
 * backfill window, and queues an evaluation for each account that posted them, as if they had
 * arrived by webhook. Queues the next page while threads are still inside the window, and
 * follow-ups for comments the page didn't include.
 */
export async function backfillPage(
	db: Db,
	queue: JobSender,
	client: GithubClient,
	job: BackfillPage
): Promise<{ accounts: number; next: boolean }> {
	const since = new Date(job.since);
	const page = await client.recentThreads(job.kind, job.repository, job.cursor);
	const authors = new Set<number>();
	let reachedWindowStart = false;

	for (const thread of page.threads) {
		if (new Date(thread.updatedAt) < since) {
			reachedWindowStart = true;
			break;
		}
		await storeThread(db, {
			id: thread.id,
			repository_id: job.repository.id,
			kind: job.kind,
			number: thread.number,
			author_id: thread.author?.databaseId ?? null,
			category_name: thread.category?.name ?? null,
			category_answerable: thread.category?.isAnswerable ?? false,
			created_at: thread.createdAt
		});
		await storeWindow(db, thread.id, thread.comments.comments, since, authors);
		await queueFollowUps(
			queue,
			{
				installationId: job.installationId,
				thread: { id: thread.id, kind: job.kind },
				commentId: null,
				cursor: null,
				since: job.since
			},
			thread.comments
		);
	}

	await queueEvaluations(queue, job.installationId, authors);
	const next = !reachedWindowStart && page.hasMore;
	if (next) {
		const nextPage = { ...job, cursor: page.cursor };
		await queue.send(backfillPageQueue, nextPage, { singletonKey: backfillPageKey(nextPage) });
	}
	return { accounts: authors.size, next };
}

/** One page of a thread's older comments, or of a discussion comment's replies. */
export async function backfillComments(
	db: Db,
	queue: JobSender,
	client: GithubClient,
	job: BackfillComments
): Promise<void> {
	const page = await client.olderComments(job.commentId ?? job.thread.id, job.cursor);
	const authors = new Set<number>();
	await storeWindow(db, job.thread.id, page.comments, new Date(job.since), authors);
	await queueFollowUps(queue, job, page);
	await queueEvaluations(queue, job.installationId, authors);
}

/**
 * Queues the next page of `page` while it may still reach into the window, and the replies of
 * any top-level discussion comment that has some. Replies can be newer than the comment they
 * answer, so a discussion's top-level comments are followed all the way back.
 */
async function queueFollowUps(queue: JobSender, job: BackfillComments, page: CommentPage) {
	const oldest = page.comments.at(-1);
	const followAllTheWay = job.thread.kind === 'discussion' && job.commentId === null;
	if (
		page.hasOlder &&
		oldest &&
		(followAllTheWay || new Date(oldest.createdAt) >= new Date(job.since))
	) {
		const older = { ...job, cursor: page.cursor };
		await queue.send(backfillCommentsQueue, older, { singletonKey: backfillCommentsKey(older) });
	}
	if (job.commentId !== null) {
		return;
	}
	for (const comment of page.comments) {
		if ((comment.replyCount ?? 0) > 0) {
			const replies = { ...job, commentId: comment.id, cursor: null };
			await queue.send(backfillCommentsQueue, replies, {
				singletonKey: backfillCommentsKey(replies)
			});
		}
	}
}

async function storeWindow(
	db: Db,
	threadId: string,
	comments: RecentComment[],
	since: Date,
	authors: Set<number>
) {
	for (const comment of comments) {
		const author = comment.author;
		if (
			new Date(comment.createdAt) < since ||
			author?.__typename !== 'User' ||
			author.databaseId === undefined ||
			author.id === undefined
		) {
			continue;
		}
		await storeUser(db, { id: author.databaseId, node_id: author.id, login: author.login });
		await storeComment(db, {
			id: comment.id,
			author_id: author.databaseId,
			thread_id: threadId,
			author_association: comment.authorAssociation,
			is_answer: comment.isAnswer ?? false,
			body: comment.body,
			created_at: comment.createdAt,
			edited_at: comment.lastEditedAt,
			source: 'backfill'
		});
		authors.add(author.databaseId);
	}
}

async function queueEvaluations(queue: JobSender, installationId: number, authors: Set<number>) {
	for (const userId of authors) {
		const evaluation = { installationId, userId };
		await queue.send(evaluateQueue, evaluation, { singletonKey: jobKey(evaluation) });
	}
}
