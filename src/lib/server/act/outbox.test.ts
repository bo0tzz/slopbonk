import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import type { GithubActions } from '../github/actions';
import { RateLimitedError } from '../github/rate-limit';
import { createTestDatabase } from '../testing/database';
import { seedCase } from '../testing/fixtures';
import { carryOut, requeuePending } from './outbox';

describe('carryOut', () => {
	let db: Db;
	let drop: () => Promise<void>;
	const calls: string[] = [];
	let failWith: Error | null = null;
	const actions: GithubActions = {
		async blockUser(org, login) {
			if (failWith) throw failWith;
			calls.push(`block ${org} ${login}`);
		},
		async minimizeComment(commentId) {
			if (failWith) throw failWith;
			calls.push(`hide ${commentId}`);
			return true;
		}
	};
	const actionsFor = async () => actions;

	beforeAll(async () => {
		const testDb = await createTestDatabase();
		drop = testDb.drop;
		db = createDb(testDb.url);
		await migrateToLatest(db);
		await db.insertInto('github_users').values({ id: 1, login: 'reviewer' }).execute();
	});

	afterAll(async () => {
		await db?.destroy();
		await drop?.();
	});

	async function item(
		installationId: number,
		userId: number,
		accountType: 'Organization' | 'User' = 'Organization',
		hide?: string
	) {
		const caseId = await seedCase(db, { installationId, accountType, userId, comments: 1 });
		const { id: decisionId } = await db
			.insertInto('decisions')
			.values({ case_id: caseId, actor_id: 1, action: 'block' })
			.returning('id')
			.executeTakeFirstOrThrow();
		const { id } = await db
			.insertInto('outbox')
			.values({
				decision_id: decisionId,
				installation_id: installationId,
				action: hide ? 'minimize_comment' : 'block_user',
				target_user_id: userId,
				comment_id: hide ?? null
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		return id;
	}

	const row = (id: number) =>
		db
			.selectFrom('outbox')
			.select(['status', 'attempts', 'last_error'])
			.where('id', '=', id)
			.executeTakeFirstOrThrow();

	it('blocks in the installation’s organisation and marks the item done', async () => {
		const id = await item(10, 200);
		await carryOut(db, actionsFor, id, false);
		expect(calls).toContain('block org-100 user-200');
		expect(await row(id)).toEqual({ status: 'done', attempts: 1, last_error: null });
	});

	it('keeps an item pending for retry until the final attempt', async () => {
		const id = await item(10, 202);
		failWith = new Error('GitHub is down');
		await expect(carryOut(db, actionsFor, id, false)).rejects.toThrow('GitHub is down');
		expect(await row(id)).toEqual({ status: 'pending', attempts: 1, last_error: 'GitHub is down' });
		await expect(carryOut(db, actionsFor, id, true)).rejects.toThrow('GitHub is down');
		expect(await row(id)).toMatchObject({ status: 'failed', attempts: 2 });
		failWith = null;
	});

	it('fails at once, without retrying, when blocking can’t work', async () => {
		const id = await item(20, 203, 'User');
		await carryOut(db, actionsFor, id, false);
		expect(await row(id)).toMatchObject({ status: 'failed', attempts: 1 });
		expect(calls).not.toContain('block org-200 user-203');
	});

	it('does nothing for items that are no longer pending', async () => {
		const id = await item(10, 204);
		await carryOut(db, actionsFor, id, false);
		const before = calls.length;
		await carryOut(db, actionsFor, id, false);
		expect(calls.length).toBe(before);
	});

	it('hides a comment', async () => {
		const id = await item(10, 206, 'Organization', 'C_206_0');
		await carryOut(db, actionsFor, id, false);
		expect(calls).toContain('hide C_206_0');
		expect(await row(id)).toMatchObject({ status: 'done' });
	});

	it('leaves the item untouched when GitHub is rate limiting, for the job to be deferred', async () => {
		const id = await item(10, 207);
		failWith = new RateLimitedError(new Date());
		await expect(carryOut(db, actionsFor, id, true)).rejects.toBeInstanceOf(RateLimitedError);
		expect(await row(id)).toEqual({ status: 'pending', attempts: 0, last_error: null });
		failWith = null;
	});

	it('requeues pending items', async () => {
		const id = await item(10, 205);
		const sent: object[] = [];
		await requeuePending(db, { send: async (_queue, data) => (sent.push(data), 'job') });
		expect(sent).toContainEqual({ installationId: 10, outboxId: id });
	});
});
