import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import { createTestDatabase } from '../testing/database';
import { evaluate } from './evaluate';
import { RULESET } from './rules';

const now = new Date('2026-10-03T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const ORG = 100;
const INSTALLATION = 10;
const job = (userId: number) => ({ installationId: INSTALLATION, userId });

describe('evaluate', () => {
	let db: Db;
	let drop: () => Promise<void>;
	let sent: { queue: string; data: object; key?: string; startAfter?: Date }[];
	const queue = {
		async send(
			definition: { name: string },
			data: object,
			options?: { singletonKey?: string; startAfter?: number | string | Date }
		) {
			sent.push({
				queue: definition.name,
				data,
				key: options?.singletonKey,
				startAfter: options?.startAfter as Date | undefined
			});
			return 'job-id';
		}
	};

	async function repository(id: number, ownerId: number) {
		await db
			.insertInto('repositories')
			.values({
				id,
				node_id: `R_${id}`,
				owner_id: ownerId,
				owner_login: `owner-${ownerId}`,
				name: `repo-${id}`
			})
			.onConflict((oc) => oc.column('id').doNothing())
			.execute();
	}

	/** One answer per repository, one second apart: a minute-long burst across `repos` repositories. */
	async function account(
		userId: number,
		{
			repos = 4,
			association = 'NONE',
			fetched = true
		}: { repos?: number; association?: string; fetched?: boolean } = {}
	) {
		await db
			.insertInto('github_users')
			.values({ id: userId, login: `user-${userId}` })
			.execute();
		for (let i = 0; i < repos; i++) {
			const repoId = i === 0 ? 1 : userId * 100 + i;
			await repository(repoId, i === 0 ? ORG : 5000 + i);
			const threadId = `D_${userId}_${i}`;
			await db
				.insertInto('threads')
				.values({
					id: threadId,
					repository_id: repoId,
					kind: 'discussion',
					number: i,
					author_id: 999,
					category_name: 'Q&A',
					category_answerable: true,
					created_at: minutesAgo(60)
				})
				.execute();
			await db
				.insertInto('comments')
				.values({
					id: `C_${userId}_${i}`,
					author_id: userId,
					thread_id: threadId,
					author_association: i === 0 ? association : 'NONE',
					body: 'answer',
					created_at: new Date(minutesAgo(5).getTime() + i * 1000),
					source: i === 0 ? 'webhook' : 'history'
				})
				.execute();
		}
		if (fetched) {
			await db
				.insertInto('tracked_users')
				.values({
					user_id: userId,
					last_fetched_at: minutesAgo(1),
					history_from: minutesAgo(60 * 24 * 365)
				})
				.execute();
		}
	}

	beforeAll(async () => {
		const testDb = await createTestDatabase();
		drop = testDb.drop;
		db = createDb(testDb.url);
		await migrateToLatest(db);
		await db
			.insertInto('installations')
			.values({
				id: INSTALLATION,
				account_id: ORG,
				account_login: 'org',
				account_type: 'Organization'
			})
			.execute();
	});

	afterAll(async () => {
		await db?.destroy();
		await drop?.();
	});

	beforeEach(() => {
		sent = [];
	});

	it('skips accounts without comments in the installation’s repositories', async () => {
		await db.insertInto('github_users').values({ id: 1, login: 'outsider' }).execute();
		expect(await evaluate(db, queue, job(1), now)).toBe('skipped');
	});

	it('leaves exempt authors alone', async () => {
		await account(2, { association: 'MEMBER' });
		expect(await evaluate(db, queue, job(2), now)).toBe('exempt');
		expect(await db.selectFrom('cases').selectAll().where('user_id', '=', 2).execute()).toEqual([]);
	});

	it('asks for history when it is missing, and evaluates nothing yet', async () => {
		await account(3, { fetched: false });
		expect(await evaluate(db, queue, job(3), now)).toBe('awaiting-history');
		expect(sent).toEqual([
			{ queue: 'ingest.fetch-history', data: job(3), key: '10:3', startAfter: undefined }
		]);
		expect(
			await db.selectFrom('evaluations').selectAll().where('user_id', '=', 3).execute()
		).toEqual([]);
	});

	it('does not ask again for accounts that no longer exist', async () => {
		await account(4, { fetched: false });
		await db
			.insertInto('tracked_users')
			.values({ user_id: 4, gone_at: minutesAgo(1) })
			.execute();
		expect(await evaluate(db, queue, job(4), now)).toBe('gone');
		expect(sent).toEqual([]);
	});

	it('scores a farmer-like burst, opens a case and schedules re-checks', async () => {
		await account(5);
		const result = await evaluate(db, queue, job(5), now);
		expect(result).toMatchObject({ score: 4 });

		const caseRow = await db
			.selectFrom('cases')
			.selectAll()
			.where('user_id', '=', 5)
			.executeTakeFirstOrThrow();
		expect(caseRow).toMatchObject({ state: 'open', score: 4 });
		expect(caseRow.score).toBeGreaterThanOrEqual(RULESET.queueThreshold);

		const values = await db
			.selectFrom('signal_values')
			.innerJoin('evaluations', 'evaluations.id', 'signal_values.evaluation_id')
			.select(['signal_name', 'value'])
			.where('evaluations.user_id', '=', 5)
			.orderBy('signal_name')
			.execute();
		expect(values).toEqual([
			{ signal_name: 'peak_repos_1m', value: 4 },
			{ signal_name: 'peak_repos_24h', value: 4 },
			{ signal_name: 'qa_share', value: 1 },
			{ signal_name: 'qa_share_burst', value: 1 }
		]);

		expect(sent.map((s) => s.key)).toEqual([
			'10:5:recheck:3600000',
			'10:5:recheck:86400000',
			'10:5:recheck:259200000'
		]);
		expect(sent[0].startAfter).toEqual(new Date(now.getTime() + 3_600_000));
	});

	it('updates the existing case on re-evaluation without scheduling more re-checks', async () => {
		const result = await evaluate(db, queue, job(5), new Date(now.getTime() + 60_000));
		expect(result).toMatchObject({ score: 4 });
		expect(sent).toEqual([]);
		expect(
			await db.selectFrom('cases').selectAll().where('user_id', '=', 5).execute()
		).toHaveLength(1);
		expect(
			await db.selectFrom('evaluations').selectAll().where('user_id', '=', 5).execute()
		).toHaveLength(2);
	});

	it('reopens a dismissed case only when the score rises past the dismissal', async () => {
		await account(6);
		await evaluate(db, queue, job(6), now);
		await db
			.updateTable('cases')
			.set({ state: 'dismissed', dismissed_score: 4 })
			.where('user_id', '=', 6)
			.execute();
		await evaluate(db, queue, job(6), now);
		expect(
			(
				await db
					.selectFrom('cases')
					.select('state')
					.where('user_id', '=', 6)
					.executeTakeFirstOrThrow()
			).state
		).toBe('dismissed');

		await db.updateTable('cases').set({ dismissed_score: 2 }).where('user_id', '=', 6).execute();
		await evaluate(db, queue, job(6), now);
		expect(
			(
				await db
					.selectFrom('cases')
					.select('state')
					.where('user_id', '=', 6)
					.executeTakeFirstOrThrow()
			).state
		).toBe('open');
	});

	it('skips installations that were removed', async () => {
		await db
			.updateTable('installations')
			.set({ uninstalled_at: now })
			.where('id', '=', INSTALLATION)
			.execute();
		expect(await evaluate(db, queue, job(5), now)).toBe('skipped');
		await db
			.updateTable('installations')
			.set({ uninstalled_at: null })
			.where('id', '=', INSTALLATION)
			.execute();
	});
});
