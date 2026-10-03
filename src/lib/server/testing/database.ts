import { randomUUID } from 'node:crypto';
import pg from 'pg';

const adminUrl =
	process.env.TEST_DATABASE_URL ?? 'postgres://slopbonk:slopbonk@localhost:5432/slopbonk';

async function admin(query: string) {
	const client = new pg.Client({ connectionString: adminUrl });
	await client.connect();
	try {
		await client.query(query);
	} finally {
		await client.end();
	}
}

/** Creates an empty database for a test suite; call `drop` when done. */
export async function createTestDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
	const name = `slopbonk_test_${randomUUID().replaceAll('-', '')}`;
	await admin(`CREATE DATABASE ${name}`);
	const url = new URL(adminUrl);
	url.pathname = `/${name}`;
	return { url: url.toString(), drop: () => admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`) };
}
