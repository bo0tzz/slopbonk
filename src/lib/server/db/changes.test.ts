import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '.';
import { listenForReviewChanges, type ReviewChange, type ReviewChanges } from './changes';
import { migrateToLatest } from './migrate';
import { createTestDatabase } from '../testing/database';
import { seedCase } from '../testing/fixtures';

describe('listenForReviewChanges', () => {
	let db: Db;
	let drop: () => Promise<void>;
	let changes: ReviewChanges;

	beforeAll(async () => {
		const testDb = await createTestDatabase();
		drop = testDb.drop;
		db = createDb(testDb.url);
		await migrateToLatest(db);
		changes = await listenForReviewChanges(testDb.url);
	});

	afterAll(async () => {
		await changes?.stop();
		await db?.destroy();
		await drop?.();
	});

	function collect() {
		const seen: ReviewChange[] = [];
		const unsubscribe = changes.subscribe((change) => seen.push(change));
		const settled = () => new Promise((resolve) => setTimeout(resolve, 200));
		return { seen, settled, unsubscribe };
	}

	it('reports which installation and account changed, for cases, outbox and installations', async () => {
		const { seen, settled, unsubscribe } = collect();
		const caseId = await seedCase(db, { installationId: 10, userId: 300 });
		await db.insertInto('github_users').values({ id: 1, login: 'reviewer' }).execute();
		const { id: decisionId } = await db
			.insertInto('decisions')
			.values({ case_id: caseId, actor_id: 1, action: 'block' })
			.returning('id')
			.executeTakeFirstOrThrow();
		await db
			.insertInto('outbox')
			.values({
				decision_id: decisionId,
				installation_id: 10,
				action: 'block_user',
				target_user_id: 300
			})
			.execute();
		await settled();
		unsubscribe();

		expect(seen).toEqual([
			{ table: 'installations', installationId: 10, userId: null },
			{ table: 'cases', installationId: 10, userId: 300 },
			{ table: 'outbox', installationId: 10, userId: 300 }
		]);
	});

	it('stops telling a listener once it unsubscribes', async () => {
		const { seen, settled, unsubscribe } = collect();
		unsubscribe();
		await db.updateTable('cases').set({ score: 3 }).where('user_id', '=', 300).execute();
		await settled();
		expect(seen).toEqual([]);
	});
});
