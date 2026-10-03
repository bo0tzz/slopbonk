import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../testing/database';
import { createDb, type Db } from '.';
import { migrateToLatest, migrator } from './migrate';

describe('migrations', () => {
	let db: Db;
	let drop: () => Promise<void>;

	async function tableNames() {
		const tables = await db.introspection.getTables();
		return tables.map((t) => t.name).filter((name) => !name.startsWith('kysely_migrations'));
	}

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

	it('creates the schema', async () => {
		expect((await tableNames()).sort()).toEqual([
			'cases',
			'comment_edits',
			'comments',
			'config_changes',
			'decisions',
			'evaluations',
			'github_users',
			'installations',
			'migration_overrides',
			'outbox',
			'repositories',
			'signal_definitions',
			'signal_values',
			'threads',
			'tracked_users'
		]);
	});

	it('keeps signal definitions insert-only', async () => {
		await db
			.insertInto('signal_definitions')
			.values({ name: 'peak_repos_24h', version: 1, description: 'test' })
			.execute();
		await expect(
			db.updateTable('signal_definitions').set({ description: 'changed' }).execute()
		).rejects.toThrow(/insert-only/);
		await expect(db.deleteFrom('signal_definitions').execute()).rejects.toThrow(/insert-only/);
	});

	it('rejects signal values for unknown signal versions', async () => {
		await db
			.insertInto('github_users')
			.values({ id: 1, node_id: 'U_1', login: 'someone', account_created_at: new Date() })
			.execute();
		const { id } = await db
			.insertInto('evaluations')
			.values({ user_id: 1, ruleset_version: 'test', data_as_of: new Date() })
			.returning('id')
			.executeTakeFirstOrThrow();
		await expect(
			db
				.insertInto('signal_values')
				.values({ evaluation_id: id, signal_name: 'peak_repos_24h', signal_version: 2, value: 3 })
				.execute()
		).rejects.toThrow(/foreign key/);
	});

	it('requires exactly one outbox target', async () => {
		await db
			.insertInto('installations')
			.values({ id: 10, org_id: 20, org_login: 'org', config: '{}' })
			.execute();
		const { id: caseId } = await db
			.insertInto('cases')
			.values({
				installation_id: 10,
				user_id: 1,
				score: 1,
				first_seen_at: new Date(),
				last_seen_at: new Date()
			})
			.returning('id')
			.executeTakeFirstOrThrow();
		const { id: decisionId } = await db
			.insertInto('decisions')
			.values({ case_id: caseId, actor_id: 1, action: 'block' })
			.returning('id')
			.executeTakeFirstOrThrow();
		await expect(
			db
				.insertInto('outbox')
				.values({ decision_id: decisionId, installation_id: 10, action: 'block_user' })
				.execute()
		).rejects.toThrow(/check constraint/);
	});

	it('migrates down cleanly', async () => {
		const { error } = await migrator(db).migrateDown();
		expect(error).toBeUndefined();
		expect(await tableNames()).toEqual([]);
	});
});
