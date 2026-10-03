import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

export type Db = Kysely<DB>;

// Postgres bigint ids fit comfortably within Number.MAX_SAFE_INTEGER for GitHub ids.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export function createDb(connectionString: string): Db {
	return new Kysely<DB>({
		dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) })
	});
}
