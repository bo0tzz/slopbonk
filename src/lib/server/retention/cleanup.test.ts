import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import type { CaseState } from '../db/schema/tables/case.table';
import { createTestDatabase } from '../testing/database';
import { cleanUp } from './cleanup';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-03T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

const TENANT = { installation: 10, account: 100 };
const LONG_GONE = { installation: 20, account: 200 };
const RECENTLY_GONE = { installation: 30, account: 300 };
const OUTSIDE = 900;
const REVIEWER = 1;

describe('cleanUp', () => {
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

	async function user(id: number, updatedDaysAgo = 40) {
		await db
			.insertInto('github_users')
			.values({ id, login: `user-${id}`, updated_at: daysAgo(updatedDaysAgo) })
			.execute();
	}

	async function installation(
		{ installation: id, account }: typeof TENANT,
		uninstalledDaysAgo: number | null
	) {
		await db
			.insertInto('installations')
			.values({
				id,
				account_id: account,
				account_login: `org-${account}`,
				account_type: 'Organization',
				uninstalled_at: uninstalledDaysAgo === null ? null : daysAgo(uninstalledDaysAgo)
			})
			.execute();
	}

	/** A comment in a repository of `owner`, in a thread of its own, fetched `fetchedDaysAgo`. */
	async function comment(author: number, owner: number, fetchedDaysAgo = 40) {
		const repository = owner + 1;
		await db
			.insertInto('repositories')
			.values({
				id: repository,
				node_id: `R_${repository}`,
				owner_id: owner,
				owner_login: `owner-${owner}`,
				name: 'repo'
			})
			.onConflict((oc) => oc.column('id').doNothing())
			.execute();
		const thread = `T_${author}_${owner}`;
		await db
			.insertInto('threads')
			.values({
				id: thread,
				repository_id: repository,
				kind: 'discussion',
				number: 1,
				author_id: null,
				category_name: 'Q&A',
				category_answerable: true,
				created_at: daysAgo(60)
			})
			.execute();
		await db
			.insertInto('comments')
			.values({
				id: `C_${author}_${owner}`,
				author_id: author,
				thread_id: thread,
				author_association: 'NONE',
				body: 'answer',
				created_at: daysAgo(fetchedDaysAgo),
				fetched_at: daysAgo(fetchedDaysAgo),
				source: 'history'
			})
			.execute();
		await db
			.insertInto('tracked_users')
			.values({ user_id: author, last_fetched_at: daysAgo(fetchedDaysAgo) })
			.onConflict((oc) => oc.column('user_id').doNothing())
			.execute();
	}

	async function evaluation(userId: number, evaluatedDaysAgo: number) {
		const { id } = await db
			.insertInto('evaluations')
			.values({
				user_id: userId,
				evaluated_at: daysAgo(evaluatedDaysAgo),
				ruleset_version: '1',
				data_as_of: daysAgo(evaluatedDaysAgo)
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		return id;
	}

	async function caseFor(userId: number, tenant: typeof TENANT, state: CaseState) {
		const { id } = await db
			.insertInto('cases')
			.values({
				installation_id: tenant.installation,
				user_id: userId,
				state,
				score: 4,
				first_seen_at: daysAgo(60),
				last_seen_at: daysAgo(60)
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		return id;
	}

	async function decide(caseId: number, evaluationId: number | null) {
		const { id } = await db
			.insertInto('decisions')
			.values({
				case_id: caseId,
				actor_id: REVIEWER,
				action: 'dismiss',
				evaluation_id: evaluationId
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		return id;
	}

	const exists = async (table: 'github_users' | 'installations', id: number) =>
		(await db.selectFrom(table).select('id').where('id', '=', id).executeTakeFirst()) !== undefined;
	const commentExists = async (author: number, owner: number) =>
		(await db
			.selectFrom('comments')
			.select('id')
			.where('id', '=', `C_${author}_${owner}`)
			.executeTakeFirst()) !== undefined;
	const evaluationExists = async (id: number) =>
		(await db.selectFrom('evaluations').select('id').where('id', '=', id).executeTakeFirst()) !==
		undefined;
	const isTracked = async (userId: number) =>
		(await db
			.selectFrom('tracked_users')
			.select('user_id')
			.where('user_id', '=', userId)
			.executeTakeFirst()) !== undefined;

	it('applies each retention rule and keeps everything still in use', async () => {
		await user(REVIEWER);
		await installation(TENANT, null);
		await installation(LONG_GONE, 40);
		await installation(RECENTLY_GONE, 5);

		// History of an unflagged account, last evaluated 40 days ago: removed.
		await user(301);
		await comment(301, OUTSIDE);
		await evaluation(301, 40);
		// The same, but with an open or a blocked case somewhere: kept.
		await user(302);
		await comment(302, OUTSIDE);
		await evaluation(302, 40);
		await caseFor(302, TENANT, 'open');
		await user(303);
		await comment(303, OUTSIDE);
		await evaluation(303, 40);
		await caseFor(303, TENANT, 'blocked');
		// Evaluated recently: kept.
		await user(304);
		await comment(304, OUTSIDE);
		await evaluation(304, 5);
		// A comment in an installed tenant's repository: kept.
		await user(305);
		await comment(305, TENANT.account);
		await evaluation(305, 40);
		// A tenant uninstalled 40 days ago: its data goes, and its repositories count as outside.
		await user(306);
		await comment(306, LONG_GONE.account);
		await evaluation(306, 40);
		const goneCase = await caseFor(306, LONG_GONE, 'open');
		// Uninstalled only 5 days ago: kept for now.
		await user(307);
		await comment(307, RECENTLY_GONE.account);
		await evaluation(307, 40);
		await caseFor(307, RECENTLY_GONE, 'open');

		// Evaluations.
		await user(310);
		await comment(310, TENANT.account);
		const unlabelled = await evaluation(310, 100);
		const recent = await evaluation(310, 5);
		const dismissed = await caseFor(310, TENANT, 'dismissed');
		const labelled = await evaluation(310, 100);
		await decide(dismissed, labelled);
		const ancient = await evaluation(310, 800);
		const ancientDecision = await decide(dismissed, ancient);
		await user(311);
		await comment(311, TENANT.account);
		const olderOpen = await evaluation(311, 120);
		const latestOpen = await evaluation(311, 100);
		await caseFor(311, TENANT, 'open');

		// An installed tenant's repositories and threads, stored by a backfill still running.
		await db
			.insertInto('repositories')
			.values([
				{ id: 150, node_id: 'R_150', owner_id: TENANT.account, owner_login: 'org', name: 'empty' },
				{ id: 151, node_id: 'R_151', owner_id: TENANT.account, owner_login: 'org', name: 'quiet' }
			])
			.execute();
		await db
			.insertInto('threads')
			.values({
				id: 'T_quiet',
				repository_id: 151,
				kind: 'issue',
				number: 1,
				author_id: null,
				category_name: null,
				category_answerable: false,
				created_at: daysAgo(60)
			})
			.execute();

		// Accounts nothing refers to: removed after the grace period.
		await user(320, 40);
		await user(321, 5);

		const result = await cleanUp(db, now);

		expect(result).toEqual({
			uninstalledTenants: 1,
			historyComments: 2,
			threads: 2,
			repositories: 1,
			evaluations: 3,
			accounts: 1
		});

		expect(await commentExists(301, OUTSIDE)).toBe(false);
		expect(await isTracked(301)).toBe(false);
		expect(await commentExists(302, OUTSIDE)).toBe(true);
		expect(await isTracked(302)).toBe(true);
		expect(await commentExists(303, OUTSIDE)).toBe(true);
		expect(await commentExists(304, OUTSIDE)).toBe(true);
		expect(await commentExists(305, TENANT.account)).toBe(true);

		expect(await exists('installations', LONG_GONE.installation)).toBe(false);
		expect(await db.selectFrom('cases').where('id', '=', goneCase).execute()).toEqual([]);
		expect(await commentExists(306, LONG_GONE.account)).toBe(false);
		expect(await exists('installations', RECENTLY_GONE.installation)).toBe(true);
		expect(await commentExists(307, RECENTLY_GONE.account)).toBe(true);

		expect(await evaluationExists(unlabelled)).toBe(false);
		expect(await evaluationExists(recent)).toBe(true);
		expect(await evaluationExists(labelled)).toBe(true);
		expect(await evaluationExists(ancient)).toBe(false);
		const decision = await db
			.selectFrom('decisions')
			.select('evaluation_id')
			.where('id', '=', ancientDecision)
			.executeTakeFirstOrThrow();
		expect(decision.evaluation_id).toBeNull();
		expect(await evaluationExists(olderOpen)).toBe(false);
		expect(await evaluationExists(latestOpen)).toBe(true);

		const tenantRepositories = await db
			.selectFrom('repositories')
			.select('id')
			.where('id', 'in', [150, 151])
			.execute();
		expect(tenantRepositories).toHaveLength(2);
		const quiet = await db.selectFrom('threads').where('id', '=', 'T_quiet').execute();
		expect(quiet).toHaveLength(1);

		expect(await exists('github_users', 320)).toBe(false);
		expect(await exists('github_users', 321)).toBe(true);
		expect(await exists('github_users', 301)).toBe(true);
		expect(await exists('github_users', REVIEWER)).toBe(true);
	});
});
