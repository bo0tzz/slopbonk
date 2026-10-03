import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { migrateToLatest } from '../db/migrate';
import { createTestDatabase } from '../testing/database';
import { seedCase } from '../testing/fixtures';
import { overview } from './overview';

describe('admin overview', () => {
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

	it('summarises queues, failures, installations and rate limits', async () => {
		const caseId = await seedCase(db, { installationId: 10, userId: 300 });
		await seedCase(db, { installationId: 10, userId: 301 });
		await db.updateTable('cases').set({ state: 'blocked' }).where('id', '=', caseId).execute();
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
				target_user_id: 300,
				status: 'failed',
				attempts: 6,
				last_error: 'Not Found',
				completed_at: new Date('2026-10-03T12:00:00Z')
			})
			.execute();
		const failedAt = new Date('2026-10-03T11:00:00Z');
		const queue = {
			stats: async () =>
				[
					{
						name: 'policy.evaluate',
						readyCount: 2,
						deferredCount: 5,
						activeCount: 1,
						failedCount: 0
					},
					{ name: 'jobs.failed', readyCount: 1, deferredCount: 0, activeCount: 0, failedCount: 0 }
				] as never,
			list: async () =>
				[
					{
						sourceName: 'ingest.fetch-history',
						sourceId: 'original-job',
						createdOn: failedAt,
						output: null,
						data: { installationId: 10, userId: 301 }
					}
				] as never,
			find: async (name: string, id: string) =>
				(name === 'ingest.fetch-history' && id === 'original-job'
					? { output: { message: 'Bad credentials' } }
					: null) as never
		};

		const result = await overview(db, queue, [
			{ installationId: 10, until: new Date('2026-10-03T13:00:00Z') }
		]);

		expect(result.queues).toEqual([
			{ name: 'policy.evaluate', ready: 2, deferred: 5, active: 1, failed: 0 }
		]);
		expect(result.failedJobs).toEqual([
			{
				queue: 'ingest.fetch-history',
				failedAt,
				error: 'Bad credentials',
				data: { installationId: 10, userId: 301 }
			}
		]);
		expect(result.failedActions).toEqual([
			{
				installation: 'org-100',
				action: 'block_user',
				target: 'user-300',
				attempts: 6,
				error: 'Not Found',
				failedAt: new Date('2026-10-03T12:00:00Z')
			}
		]);
		expect(result.installations).toMatchObject([
			{ id: 10, login: 'org-100', open: 1, blocked: 1, dismissed: 0, uninstalledAt: null }
		]);
		expect(result.rateLimits).toEqual([
			{ installation: 'org-100', until: new Date('2026-10-03T13:00:00Z') }
		]);
	});
});
