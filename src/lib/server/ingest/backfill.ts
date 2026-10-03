import type { Db } from '../db';
import { INSTALL_BACKFILL_MS } from '../constants';
import type { GithubClient } from '../github/client';
import {
	backfillPageKey,
	backfillPageQueue,
	evaluateQueue,
	jobKey,
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
	installationId: number,
	now = new Date()
): Promise<number> {
	const since = new Date(now.getTime() - INSTALL_BACKFILL_MS).toISOString();
	let queued = 0;
	for (const repository of await client.installationRepositories()) {
		const record = repositoryRecord(repository);
		if (!record) {
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
 * Stores one page of recently updated threads' comments from inside the backfill window and queues
 * an evaluation for each account that posted them, as if they had arrived by webhook. Queues the
 * next page while threads are still inside the window.
 */
export async function backfillPage(
	db: Db,
	queue: JobSender,
	client: GithubClient,
	job: BackfillPage
): Promise<{ comments: number; next: boolean }> {
	const since = new Date(job.since);
	const page = await client.recentThreads(job.kind, job.repository, job.cursor);
	const authors = new Set<number>();
	let comments = 0;
	let reachedWindowStart = false;

	for (const thread of page.threads) {
		if (new Date(thread.updatedAt) < since) {
			reachedWindowStart = true;
			break;
		}
		const recent = thread.comments.flatMap((comment) => {
			const author = comment.author;
			if (
				new Date(comment.createdAt) < since ||
				author?.__typename !== 'User' ||
				author.databaseId === undefined ||
				author.id === undefined
			) {
				return [];
			}
			return [
				{ comment, author: { id: author.databaseId, node_id: author.id, login: author.login } }
			];
		});
		if (recent.length === 0) {
			continue;
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
		for (const { comment, author } of recent) {
			await storeUser(db, author);
			await storeComment(db, {
				id: comment.id,
				author_id: author.id,
				thread_id: thread.id,
				author_association: comment.authorAssociation,
				is_answer: comment.isAnswer ?? false,
				body: comment.body,
				created_at: comment.createdAt,
				edited_at: comment.lastEditedAt,
				source: 'backfill'
			});
			authors.add(author.id);
			comments++;
		}
	}

	for (const userId of authors) {
		const evaluation = { installationId: job.installationId, userId };
		await queue.send(evaluateQueue, evaluation, { singletonKey: jobKey(evaluation) });
	}
	const next = !reachedWindowStart && page.hasMore;
	if (next) {
		const nextPage = { ...job, cursor: page.cursor };
		await queue.send(backfillPageQueue, nextPage, { singletonKey: backfillPageKey(nextPage) });
	}
	return { comments, next };
}
