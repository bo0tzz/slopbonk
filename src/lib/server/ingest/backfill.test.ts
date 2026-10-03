import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import type { CommentPage, RecentComment, RecentThread, ThreadPage } from '../github/client';
import type { BackfillComments, BackfillPage } from '../jobs';
import { createTestDatabase } from '../testing/database';
import { fakeGithubClient } from '../testing/github';
import { backfillComments, backfillPage, startBackfill } from './backfill';

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

function thread(
	id: string,
	updatedAt: string,
	comments: RecentComment[],
	older: Partial<CommentPage> = {}
): RecentThread {
	return {
		id,
		number: 1,
		createdAt: daysAgo(60),
		updatedAt,
		author: { databaseId: 9 },
		comments: { comments, cursor: null, hasOlder: false, ...older }
	};
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

		expect(await backfillPage(db, queue, client, firstPage)).toEqual({ accounts: 2, next: true });

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

		expect(await backfillPage(db, queue, client, firstPage)).toEqual({ accounts: 1, next: false });
		expect(sent.map((job) => job.queue)).toEqual(['policy.evaluate']);
	});

	it('follows a discussion all the way back, and fetches replies where there are any', async () => {
		const client = clientReturning({
			threads: [
				thread(
					'D_20',
					daysAgo(1),
					[
						{ ...comment('DC_20', 320, daysAgo(1)), replyCount: 0 },
						{ ...comment('DC_21', 321, daysAgo(90)), replyCount: 2 }
					],
					{ cursor: 'older', hasOlder: true }
				)
			],
			cursor: null,
			hasMore: false
		});

		await backfillPage(db, queue, client, firstPage);

		const base = {
			installationId: 10,
			thread: { id: 'D_20', kind: 'discussion' },
			since: firstPage.since
		};
		expect(sent.filter((job) => job.queue === 'ingest.backfill-comments')).toEqual([
			{
				queue: 'ingest.backfill-comments',
				data: { ...base, commentId: null, cursor: 'older' },
				key: '10:D_20:older'
			},
			{
				queue: 'ingest.backfill-comments',
				data: { ...base, commentId: 'DC_21', cursor: null },
				key: '10:DC_21:first'
			}
		]);
	});

	it("stops following an issue's comments at the window start", async () => {
		const client = clientReturning({
			threads: [
				thread('I_30', daysAgo(1), [comment('IC_30', 330, daysAgo(40))], {
					cursor: 'older',
					hasOlder: true
				})
			],
			cursor: null,
			hasMore: false
		});

		await backfillPage(db, queue, client, { ...firstPage, kind: 'issue' });

		expect(sent.filter((job) => job.queue === 'ingest.backfill-comments')).toEqual([]);
	});

	it("stores a comment's replies from the window and pages back until it leaves it", async () => {
		const replies: BackfillComments = {
			installationId: 10,
			thread: { id: 'D_40', kind: 'discussion' },
			commentId: 'DC_40',
			cursor: null,
			since: daysAgo(30)
		};
		await db
			.insertInto('threads')
			.values({
				id: 'D_40',
				repository_id: 200,
				kind: 'discussion',
				number: 4,
				author_id: null,
				category_name: 'Q&A',
				category_answerable: true,
				created_at: daysAgo(90)
			})
			.execute();
		const pages: Record<string, CommentPage> = {
			first: {
				comments: [comment('R_1', 340, daysAgo(2)), comment('R_2', 341, daysAgo(10))],
				cursor: 'older',
				hasOlder: true
			},
			older: {
				comments: [comment('R_3', 342, daysAgo(20)), comment('R_4', 343, daysAgo(50))],
				cursor: 'oldest',
				hasOlder: true
			}
		};
		const requested: [string, string | null][] = [];
		const client = fakeGithubClient({
			async olderComments(id, cursor) {
				requested.push([id, cursor]);
				return pages[cursor ?? 'first'];
			}
		});

		await backfillComments(db, queue, client, replies);
		expect(sent.map((job) => job.key)).toEqual(['10:DC_40:older', '10:340', '10:341']);
		sent = [];
		await backfillComments(db, queue, client, { ...replies, cursor: 'older' });
		expect(sent.map((job) => job.key)).toEqual(['10:342']);

		expect(requested).toEqual([
			['DC_40', null],
			['DC_40', 'older']
		]);
		const stored = await db
			.selectFrom('comments')
			.select('id')
			.where('thread_id', '=', 'D_40')
			.orderBy('id')
			.execute();
		expect(stored.map((row) => row.id)).toEqual(['R_1', 'R_2', 'R_3']);
	});
});
