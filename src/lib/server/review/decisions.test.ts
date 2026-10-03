import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import { createTestDatabase } from '../testing/database';
import { seedCase } from '../testing/fixtures';
import { DecisionError, recordDecision } from './decisions';

const REVIEWER = 1;

describe('recordDecision', () => {
	let db: Db;
	let drop: () => Promise<void>;
	let sent: { queue: string; data: object }[];
	const queue = {
		async send(definition: { name: string }, data: object) {
			sent.push({ queue: definition.name, data });
			return 'job-id';
		}
	};

	beforeAll(async () => {
		const testDb = await createTestDatabase();
		drop = testDb.drop;
		db = createDb(testDb.url);
		await migrateToLatest(db);
		await db.insertInto('github_users').values({ id: REVIEWER, login: 'reviewer' }).execute();
	});

	afterAll(async () => {
		await db?.destroy();
		await drop?.();
	});

	beforeEach(() => {
		sent = [];
	});

	const caseState = async (caseId: number) =>
		db
			.selectFrom('cases')
			.select(['state', 'dismissed_score'])
			.where('id', '=', caseId)
			.executeTakeFirstOrThrow();
	const outbox = async (decisionId: number) =>
		db
			.selectFrom('outbox')
			.select(['action', 'target_user_id', 'status'])
			.where('decision_id', '=', decisionId)
			.orderBy('id')
			.execute();

	it('blocks the account through the outbox', async () => {
		const caseId = await seedCase(db, { installationId: 10, userId: 100 });
		const { decisionId, outboxIds } = await recordDecision(db, queue, {
			installationId: 10,
			caseId,
			actorId: REVIEWER,
			action: 'block'
		});
		expect(await caseState(caseId)).toEqual({ state: 'blocked', dismissed_score: null });
		expect(await outbox(decisionId)).toEqual([
			{ action: 'block_user', target_user_id: 100, status: 'pending' }
		]);
		expect(sent).toEqual(
			outboxIds.map((outboxId) => ({ queue: 'act.outbox', data: { outboxId } }))
		);
	});

	it('dismisses without touching GitHub, remembering the score', async () => {
		const caseId = await seedCase(db, { installationId: 10, userId: 101 });
		const { decisionId } = await recordDecision(db, queue, {
			installationId: 10,
			caseId,
			actorId: REVIEWER,
			action: 'dismiss'
		});
		expect(await caseState(caseId)).toEqual({ state: 'dismissed', dismissed_score: 4 });
		expect(await outbox(decisionId)).toEqual([]);
		expect(sent).toEqual([]);
	});

	it('refuses to block on a personal-account installation', async () => {
		const caseId = await seedCase(db, { installationId: 20, accountType: 'User', userId: 103 });
		await expect(
			recordDecision(db, queue, { installationId: 20, caseId, actorId: REVIEWER, action: 'block' })
		).rejects.toThrow(DecisionError);
		expect((await caseState(caseId)).state).toBe('open');
		expect(sent).toEqual([]);
	});

	it('refuses a case from another installation', async () => {
		const caseId = await seedCase(db, { installationId: 30, userId: 104 });
		await expect(
			recordDecision(db, queue, { installationId: 10, caseId, actorId: REVIEWER, action: 'block' })
		).rejects.toThrow(DecisionError);
		expect((await caseState(caseId)).state).toBe('open');
	});
});
