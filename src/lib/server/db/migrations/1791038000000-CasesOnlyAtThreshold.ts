import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await sql`DELETE FROM "cases" c
		WHERE c."state" = 'open' AND c."score" < 3
		AND NOT EXISTS (SELECT 1 FROM "decisions" d WHERE d."case_id" = c."id");`.execute(db);
}

export async function down(): Promise<void> {}
