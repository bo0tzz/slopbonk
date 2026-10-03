import { Kysely, sql } from 'kysely';

// Hand-written: sql-tools doesn't detect changes to an existing check constraint's expression.
export async function up(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE "comments" DROP CONSTRAINT "comments_source_check";`.execute(db);
	await sql`ALTER TABLE "comments" ADD CONSTRAINT "comments_source_check" CHECK (source IN ('webhook', 'backfill', 'history'));`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`UPDATE "comments" SET "source" = 'webhook' WHERE "source" = 'backfill';`.execute(db);
	await sql`ALTER TABLE "comments" DROP CONSTRAINT "comments_source_check";`.execute(db);
	await sql`ALTER TABLE "comments" ADD CONSTRAINT "comments_source_check" CHECK (source IN ('webhook', 'history'));`.execute(
		db
	);
}
