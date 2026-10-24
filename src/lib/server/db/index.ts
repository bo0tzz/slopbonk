import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

export type Db = Kysely<DB>;

// Postgres bigint ids fit comfortably within Number.MAX_SAFE_INTEGER for GitHub ids.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export function createDb(connectionString: string): Db {
	const pool = new pg.Pool({ connectionString });
	// The server drops idle connections when it restarts or fails over. The pool replaces them, but
	// an 'error' event nobody listens for would crash the process.
	pool.on('error', (error) => console.error('Database connection lost', error.message));
	return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}
