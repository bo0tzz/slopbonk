import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import type { CaseState } from '../db/schema/tables/case.table';
import { createTestDatabase } from '../testing/database';
import { seedCase } from '../testing/fixtures';
import { nextToReview, queueCounts } from './queue';

const INSTALLATION = 10;

describe('review queue', () => {
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

	async function account(userId: number, state: CaseState, score: number, lastSeen: Date) {
		const caseId = await seedCase(db, { installationId: INSTALLATION, userId });
		await db
			.updateTable('cases')
			.set({ state, score, last_seen_at: lastSeen })
			.where('id', '=', caseId)
			.execute();
		return caseId;
	}

	it('counts each tab, leaving out open cases that have dropped below the threshold', async () => {
		const top = await account(301, 'open', 4, new Date('2026-10-01'));
		await account(302, 'open', 3, new Date('2026-10-03'));
		await account(303, 'open', 3, new Date('2026-10-02'));
		await account(304, 'open', 2, new Date('2026-10-03'));
		await account(305, 'blocked', 4, new Date('2026-10-03'));
		await account(306, 'dismissed', 3, new Date('2026-10-03'));

		expect(await queueCounts(db, INSTALLATION)).toEqual({ review: 3, blocked: 1, dismissed: 1 });

		expect(await nextToReview(db, INSTALLATION, top)).toBe('user-302');
		expect(await nextToReview(db, INSTALLATION, -1)).toBe('user-301');
	});
});
