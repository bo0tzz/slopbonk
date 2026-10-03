import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await sql`INSERT INTO "signal_definitions" ("name", "version", "description") VALUES
		('peak_repos_1m', 1, 'Most distinct repositories commented in within any one minute.'),
		('peak_repos_24h', 1, 'Most distinct repositories commented in within any 24 hours.'),
		('qa_share', 1, 'Share of comments in answerable (Q&A) discussion categories.'),
		('qa_share_burst', 1, 'Highest share of answers in any 24 hours spanning at least 3 repositories.')
	;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE "signal_definitions" DISABLE TRIGGER "signal_definitions_insert_only";`.execute(
		db
	);
	await sql`DELETE FROM "signal_definitions" WHERE "version" = 1 AND "name" IN ('peak_repos_1m', 'peak_repos_24h', 'qa_share', 'qa_share_burst');`.execute(
		db
	);
	await sql`ALTER TABLE "signal_definitions" ENABLE TRIGGER "signal_definitions_insert_only";`.execute(
		db
	);
}
