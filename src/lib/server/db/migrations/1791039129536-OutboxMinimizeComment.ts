import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE "outbox" ADD "comment_id" text;`.execute(db);
	await sql`ALTER TABLE "outbox" DROP CONSTRAINT "outbox_action_check";`.execute(db);
	await sql`ALTER TABLE "outbox" ADD CONSTRAINT "outbox_action_check" CHECK (action IN ('block_user', 'minimize_comment'));`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`DELETE FROM "outbox" WHERE "action" = 'minimize_comment';`.execute(db);
	await sql`ALTER TABLE "outbox" DROP CONSTRAINT "outbox_action_check";`.execute(db);
	await sql`ALTER TABLE "outbox" ADD CONSTRAINT "outbox_action_check" CHECK (action IN ('block_user'));`.execute(
		db
	);
	await sql`ALTER TABLE "outbox" DROP COLUMN "comment_id";`.execute(db);
}
