import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE "decisions" DROP CONSTRAINT "decisions_action_check";`.execute(db);
	await sql`ALTER TABLE "decisions" ADD CONSTRAINT "decisions_action_check" CHECK (action IN ('block', 'dismiss', 'unblock'));`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`DELETE FROM "decisions" WHERE "action" = 'unblock';`.execute(db);
	await sql`ALTER TABLE "decisions" DROP CONSTRAINT "decisions_action_check";`.execute(db);
	await sql`ALTER TABLE "decisions" ADD CONSTRAINT "decisions_action_check" CHECK (action IN ('block', 'dismiss'));`.execute(
		db
	);
}
