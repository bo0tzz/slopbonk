import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE "github_users" ALTER COLUMN "node_id" DROP NOT NULL;`.execute(db);
	await sql`ALTER TABLE "github_users" ALTER COLUMN "account_created_at" DROP NOT NULL;`.execute(
		db
	);
	await sql`ALTER TABLE "installations" RENAME COLUMN "org_id" TO "account_id";`.execute(db);
	await sql`ALTER TABLE "installations" RENAME COLUMN "org_login" TO "account_login";`.execute(db);
	await sql`ALTER TABLE "installations" ADD "account_type" text NOT NULL;`.execute(db);
	await sql`ALTER TABLE "installations" ADD CONSTRAINT "installations_account_type_check" CHECK (account_type IN ('Organization', 'User'));`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`ALTER TABLE "installations" DROP CONSTRAINT "installations_account_type_check";`.execute(
		db
	);
	await sql`ALTER TABLE "installations" DROP COLUMN "account_type";`.execute(db);
	await sql`ALTER TABLE "installations" RENAME COLUMN "account_login" TO "org_login";`.execute(db);
	await sql`ALTER TABLE "installations" RENAME COLUMN "account_id" TO "org_id";`.execute(db);
	await sql`ALTER TABLE "github_users" ALTER COLUMN "account_created_at" SET NOT NULL;`.execute(db);
	await sql`ALTER TABLE "github_users" ALTER COLUMN "node_id" SET NOT NULL;`.execute(db);
}
