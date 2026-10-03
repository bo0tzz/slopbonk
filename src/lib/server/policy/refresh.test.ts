import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import { createTestDatabase } from '../testing/database';
import { seedCase } from '../testing/fixtures';
import { refreshCases } from './refresh';

describe('refreshCases', () => {
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

	it('fetches each account with a case once, through an installation still in place', async () => {
		await seedCase(db, { installationId: 10, userId: 300 });
		await seedCase(db, { installationId: 20, userId: 301 });
		await db
			.insertInto('cases')
			.values({
				installation_id: 20,
				user_id: 300,
				score: 4,
				first_seen_at: new Date(),
				last_seen_at: new Date()
			})
			.execute();
		await seedCase(db, { installationId: 30, userId: 302 });
		await db
			.updateTable('installations')
			.set({ uninstalled_at: new Date() })
			.where('id', '=', 30)
			.execute();

		const sent: object[] = [];
		const count = await refreshCases(db, {
			send: async (_queue, data) => (sent.push(data), 'job')
		});

		expect(count).toBe(2);
		expect(sent).toEqual([
			{ installationId: 10, userId: 300 },
			{ installationId: 20, userId: 301 }
		]);
	});
});
