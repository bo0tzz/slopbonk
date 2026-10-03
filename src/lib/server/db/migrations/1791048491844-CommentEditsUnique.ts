import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE "comment_edits" ADD CONSTRAINT "comment_edits_comment_id_edited_at_uq" UNIQUE ("comment_id", "edited_at");`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE "comment_edits" DROP CONSTRAINT "comment_edits_comment_id_edited_at_uq";`.execute(
		db
	);
}
