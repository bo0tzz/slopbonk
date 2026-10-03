import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import type { RecentComment, RecentThread, ThreadPage } from '../github/client';
import type { BackfillPage } from '../jobs';
import { createTestDatabase } from '../testing/database';
import { fakeGithubClient } from '../testing/github';
import { backfillPage, startBackfill } from './backfill';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-03T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

const repository = {
	databaseId: 200,
	id: 'R_200',
	name: 'repo',
	owner: { login: 'org', databaseId: 100 }
};

function comment(id: string, authorId: number, createdAt: string): RecentComment {
	return {
		id,
		createdAt,
		lastEditedAt: null,
		body: `comment ${id}`,
		authorAssociation: 'NONE',
		author: {
			__typename: 'User',
			login: `user-${authorId}`,
			id: `U_${authorId}`,
			databaseId: authorId
		}
	};
}

function thread(id: string, updatedAt: string, comments: RecentComment[]): RecentThread {
	return { id, number: 1, createdAt: daysAgo(60), updatedAt, author: { databaseId: 9 }, comments };
}

describe('backfill', () => {
	let db: Db;
	let drop: () => Promise<void>;
	let sent: { queue: string; data: object; key?: string }[];
	const queue = {
		async send(definition: { name: string }, data: object, options?: { singletonKey?: string }) {
			sent.push({ queue: definition.name, data, key: options?.singletonKey });
			return 'job-id';
		}
	};

	beforeAll(async () => {
		const testDb = await createTestDatabase();
		drop = testDb.drop;
		db = createDb(testDb.url);
		await migrateToLatest(db);
	});

	afterAll(async () => {
		await db?.destroy();
		await drop?.();
	});

	beforeEach(() => {
		sent = [];
	});

	const firstPage: BackfillPage = {
		installationId: 10,
		repository: { id: 200, owner: 'org', name: 'repo' },
		kind: 'discussion',
		cursor: null,
		since: daysAgo(30)
	};

	it('queues the first page of each kind of thread per repository', async () => {
		const client = fakeGithubClient({ installationRepositories: async () => [repository] });

		expect(await startBackfill(db, queue, client, 10, now)).toBe(3);

		expect(sent.map((job) => [job.queue, (job.data as BackfillPage).kind, job.key])).toEqual([
			['ingest.backfill-page', 'discussion', '10:200:discussion:first'],
			['ingest.backfill-page', 'issue', '10:200:issue:first'],
			['ingest.backfill-page', 'pull_request', '10:200:pull_request:first']
		]);
		expect(sent[0].data).toEqual(firstPage);
	});

	function clientReturning(page: ThreadPage) {
		return fakeGithubClient({ recentThreads: async () => page });
	}

	it("stores the window's comments, queues their authors' evaluations and the next page", async () => {
		const client = clientReturning({
			threads: [
				{
					...thread('D_1', daysAgo(1), [
						comment('DC_old', 301, daysAgo(40)),
						comment('DC_1', 301, daysAgo(2)),
						comment('DC_2', 301, daysAgo(1)),
						{ ...comment('DC_bot', 0, daysAgo(2)), author: { __typename: 'Bot', login: 'bot' } }
					]),
					category: { name: 'Q&A', isAnswerable: true }
				},
				thread('D_2', daysAgo(3), [comment('DC_3', 302, daysAgo(3))])
			],
			cursor: 'page-2',
			hasMore: true
		});

		expect(await backfillPage(db, queue, client, firstPage)).toEqual({ comments: 3, next: true });

		const stored = await db
			.selectFrom('comments')
			.innerJoin('threads', 'threads.id', 'comments.thread_id')
			.select(['comments.id', 'comments.source', 'threads.category_answerable'])
			.orderBy('comments.id')
			.execute();
		expect(stored).toEqual([
			{ id: 'DC_1', source: 'backfill', category_answerable: true },
			{ id: 'DC_2', source: 'backfill', category_answerable: true },
			{ id: 'DC_3', source: 'backfill', category_answerable: false }
		]);
		expect(sent).toEqual([
			{ queue: 'policy.evaluate', data: { installationId: 10, userId: 301 }, key: '10:301' },
			{ queue: 'policy.evaluate', data: { installationId: 10, userId: 302 }, key: '10:302' },
			{
				queue: 'ingest.backfill-page',
				data: { ...firstPage, cursor: 'page-2' },
				key: '10:200:discussion:page-2'
			}
		]);
	});

	it('stops at the first thread last updated before the window', async () => {
		const client = clientReturning({
			threads: [
				thread('D_10', daysAgo(20), [comment('DC_10', 310, daysAgo(20))]),
				thread('D_11', daysAgo(31), [comment('DC_11', 311, daysAgo(31))])
			],
			cursor: 'page-3',
			hasMore: true
		});

		expect(await backfillPage(db, queue, client, firstPage)).toEqual({ comments: 1, next: false });
		expect(sent.map((job) => job.queue)).toEqual(['policy.evaluate']);
	});
});
