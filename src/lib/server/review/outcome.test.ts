import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import { createTestDatabase } from '../testing/database';
import { seedCase } from '../testing/fixtures';
import { accountEvidence } from './account';
import { recordDecision } from './decisions';
import { listQueue } from './queue';

const REVIEWER = 1;
const INSTALLATION = { id: 10, accountId: 100, login: 'org-100' };

describe('block outcomes', () => {
	let db: Db;
	let drop: () => Promise<void>;
	const queue = { send: async () => 'job-id' };

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

	async function block(userId: number) {
		const caseId = await seedCase(db, { installationId: INSTALLATION.id, userId });
		const { outboxIds } = await recordDecision(db, queue, {
			installationId: INSTALLATION.id,
			caseId,
			actor: { id: REVIEWER, login: 'reviewer' },
			action: 'block'
		});
		return outboxIds[0];
	}

	it('shows whether each block was carried out', async () => {
		await block(200);
		const failed = await block(201);
		await db
			.updateTable('outbox')
			.set({ status: 'failed', last_error: 'Resource not accessible by integration' })
			.where('id', '=', failed)
			.execute();

		const blocked = await listQueue(db, INSTALLATION, 'blocked');
		expect(Object.fromEntries(blocked.map((e) => [e.login, e.blockStatus]))).toEqual({
			'user-200': 'pending',
			'user-201': 'failed'
		});

		const evidence = await accountEvidence(db, INSTALLATION, 'user-201');
		expect(evidence?.decisions.map((d) => [d.action, d.outcome])).toEqual([
			['block', { status: 'failed', error: 'Resource not accessible by integration' }]
		]);
	});
});
