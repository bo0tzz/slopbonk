import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import type {
	DiscussionCommentNode,
	HistoryPage,
	IssueCommentNode,
	UserProfile
} from '../github/reads';
import { createTestDatabase } from '../testing/database';
import { fakeGithubClient } from '../testing/github';
import { fetchHistory } from './history';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-03T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

const repository = (n: number) => ({
	databaseId: 1000 + n,
	id: `R_${n}`,
	name: `repo-${n}`,
	owner: { login: `org-${n}`, databaseId: 2000 + n }
});

function discussionComment(id: string, createdAt: string): DiscussionCommentNode {
	return {
		id,
		createdAt,
		lastEditedAt: null,
		isAnswer: false,
		body: `answer ${id}`,
		authorAssociation: 'NONE',
		discussion: {
			id: `D_${id}`,
			number: 1,
			createdAt,
			author: { databaseId: 9 },
			category: { name: 'Q&A', isAnswerable: true },
			repository: repository(Number(id.replace(/\D/g, '')))
		}
	};
}

function prComment(id: string, createdAt: string): IssueCommentNode {
	const thread = { id: `PR_${id}`, number: 2, createdAt, author: { databaseId: 9 } };
	return {
		id,
		createdAt,
		lastEditedAt: null,
		body: 'lgtm',
		authorAssociation: 'NONE',
		repository: repository(50),
		issue: { ...thread, id: `I_${id}` },
		pullRequest: thread
	};
}

/** Splits newest-first nodes into pages of `size`, like GitHub's backwards pagination. */
function paged<T>(nodes: T[], size: number) {
	return async (cursor: string | null): Promise<HistoryPage<T>> => {
		const start = cursor ? Number(cursor) : 0;
		return {
			nodes: nodes.slice(start, start + size),
			cursor: String(start + size),
			hasOlder: start + size < nodes.length
		};
	};
}

function fakeClient(
	profile: UserProfile | null,
	discussions: DiscussionCommentNode[],
	issues: IssueCommentNode[] = []
) {
	const calls = { getUser: 0, discussionPages: 0 };
	const discussionPages = paged(discussions, 2);
	const client = fakeGithubClient({
		async getUser() {
			calls.getUser++;
			return profile;
		},
		async discussionComments(_login, cursor) {
			calls.discussionPages++;
			return discussionPages(cursor);
		},
		issueComments: async (_login, cursor) => paged(issues, 2)(cursor)
	});
	return { client, calls };
}

const profile: UserProfile = {
	id: 300,
	node_id: 'U_300',
	login: 'farmer',
	type: 'User',
	created_at: '2021-01-01T00:00:00Z',
	name: null,
	bio: null,
	followers: 1
};

describe('fetchHistory', () => {
	let db: Db;
	let drop: () => Promise<void>;

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

	const commentIds = async (userId = 300) =>
		(
			await db
				.selectFrom('comments')
				.select('id')
				.where('author_id', '=', userId)
				.orderBy('id')
				.execute()
		).map((c) => c.id);

	it('fetches back to the horizon across pages, and stores profile and threads', async () => {
		const { client } = fakeClient(
			profile,
			[
				discussionComment('C1', daysAgo(1)),
				discussionComment('C2', daysAgo(10)),
				discussionComment('C3', daysAgo(100)),
				discussionComment('C4', daysAgo(400))
			],
			[prComment('P1', daysAgo(2))]
		);
		expect(await fetchHistory(db, client, 300, now)).toBe('fetched');

		expect(await commentIds()).toEqual(['C1', 'C2', 'C3', 'P1']);
		const user = await db
			.selectFrom('github_users')
			.selectAll()
			.where('id', '=', 300)
			.executeTakeFirstOrThrow();
		expect(user).toMatchObject({ login: 'farmer', node_id: 'U_300' });
		expect(user.account_created_at).toEqual(new Date('2021-01-01T00:00:00Z'));
		const pr = await db
			.selectFrom('threads')
			.select(['kind'])
			.where('id', '=', 'PR_P1')
			.executeTakeFirstOrThrow();
		expect(pr.kind).toBe('pull_request');
	});

	it('does not call GitHub again while the stored history is fresh', async () => {
		const { client, calls } = fakeClient(profile, []);
		expect(await fetchHistory(db, client, 300, new Date(now.getTime() + 60_000))).toBe('fresh');
		expect(calls).toEqual({ getUser: 0, discussionPages: 0 });
	});

	it('later fetches only go back to just before the previous one', async () => {
		const later = new Date(now.getTime() + 3 * DAY);
		const { client, calls } = fakeClient(profile, [
			discussionComment('C5', later.toISOString()),
			discussionComment('C6', daysAgo(0.5)),
			discussionComment('C1', daysAgo(1)),
			discussionComment('C2', daysAgo(10))
		]);
		expect(await fetchHistory(db, client, 300, later)).toBe('fetched');
		expect(await commentIds()).toContain('C5');
		expect(await commentIds()).toContain('C6');
		expect(calls.discussionPages).toBe(2);
	});

	it('keeps the webhook source when history sees the same comment', async () => {
		await db.insertInto('github_users').values({ id: 301, login: 'other' }).execute();
		await db
			.insertInto('comments')
			.values({
				id: 'C10',
				author_id: 301,
				thread_id: 'D_C1',
				author_association: 'NONE',
				body: 'old body',
				created_at: daysAgo(1),
				source: 'webhook'
			})
			.execute();
		const answered = { ...discussionComment('C10', daysAgo(1)), isAnswer: true };
		await fetchHistory(
			db,
			fakeClient({ ...profile, id: 301, node_id: 'U_301' }, [answered]).client,
			301,
			now
		);
		const comment = await db
			.selectFrom('comments')
			.select(['source', 'is_answer', 'body'])
			.where('id', '=', 'C10')
			.executeTakeFirstOrThrow();
		expect(comment).toEqual({ source: 'webhook', is_answer: true, body: 'answer C10' });
	});

	it('records accounts that no longer exist', async () => {
		await db.insertInto('github_users').values({ id: 302, login: 'gone' }).execute();
		expect(await fetchHistory(db, fakeClient(null, []).client, 302, now)).toBe('gone');
		const tracked = await db
			.selectFrom('tracked_users')
			.selectAll()
			.where('user_id', '=', 302)
			.executeTakeFirstOrThrow();
		expect(tracked.gone_at).toEqual(now);
	});
});
