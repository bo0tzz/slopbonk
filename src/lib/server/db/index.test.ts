import { sql } from 'kysely';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '.';
import { createTestDatabase } from '../testing/database';

describe('createDb', () => {
	let db: Db;
	let url: string;
	let drop: () => Promise<void>;

	beforeAll(async () => {
		const testDb = await createTestDatabase();
		({ url, drop } = testDb);
		db = createDb(url);
	});

	afterAll(async () => {
		await db?.destroy();
		await drop?.();
	});

	it('carries on when the server drops an idle connection, as it does on failover', async () => {
		const { rows } = await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(db);
		const other = new pg.Client({ connectionString: url });
		await other.connect();
		await other.query('select pg_terminate_backend($1)', [rows[0].pid]);
		await other.end();
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect((await sql<{ ok: number }>`select 1 as ok`.execute(db)).rows).toEqual([{ ok: 1 }]);
	});
});
