import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await sql`CREATE OR REPLACE FUNCTION notify_review_change()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    DECLARE
			changed jsonb := to_jsonb(COALESCE(NEW, OLD));
		BEGIN
			PERFORM pg_notify('slopbonk_review_changes', json_build_object(
				'table', TG_TABLE_NAME,
				'installationId', COALESCE(changed->>'installation_id', changed->>'id')::bigint,
				'userId', COALESCE(changed->>'user_id', changed->>'target_user_id')::bigint
			)::text);
			RETURN NULL;
		END
  $$;`.execute(db);
	await sql`CREATE OR REPLACE TRIGGER "installations_notify_review_change"
  AFTER INSERT OR UPDATE OR DELETE ON "installations"
  FOR EACH ROW
  EXECUTE FUNCTION notify_review_change();`.execute(db);
	await sql`CREATE OR REPLACE TRIGGER "cases_notify_review_change"
  AFTER INSERT OR UPDATE OR DELETE ON "cases"
  FOR EACH ROW
  EXECUTE FUNCTION notify_review_change();`.execute(db);
	await sql`CREATE OR REPLACE TRIGGER "outbox_notify_review_change"
  AFTER INSERT OR UPDATE OR DELETE ON "outbox"
  FOR EACH ROW
  EXECUTE FUNCTION notify_review_change();`.execute(db);
	await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('function_notify_review_change', '{"type":"function","name":"notify_review_change","sql":"CREATE OR REPLACE FUNCTION notify_review_change()\\n  RETURNS TRIGGER\\n  LANGUAGE PLPGSQL\\n  AS $$\\n    DECLARE\\n\\t\\t\\tchanged jsonb := to_jsonb(COALESCE(NEW, OLD));\\n\\t\\tBEGIN\\n\\t\\t\\tPERFORM pg_notify(''slopbonk_review_changes'', json_build_object(\\n\\t\\t\\t\\t''table'', TG_TABLE_NAME,\\n\\t\\t\\t\\t''installationId'', COALESCE(changed->>''installation_id'', changed->>''id'')::bigint,\\n\\t\\t\\t\\t''userId'', COALESCE(changed->>''user_id'', changed->>''target_user_id'')::bigint\\n\\t\\t\\t)::text);\\n\\t\\t\\tRETURN NULL;\\n\\t\\tEND\\n  $$;"}'::jsonb);`.execute(
		db
	);
	await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_installations_notify_review_change', '{"type":"trigger","name":"installations_notify_review_change","sql":"CREATE OR REPLACE TRIGGER \\"installations_notify_review_change\\"\\n  AFTER INSERT OR UPDATE OR DELETE ON \\"installations\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION notify_review_change();"}'::jsonb);`.execute(
		db
	);
	await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_cases_notify_review_change', '{"type":"trigger","name":"cases_notify_review_change","sql":"CREATE OR REPLACE TRIGGER \\"cases_notify_review_change\\"\\n  AFTER INSERT OR UPDATE OR DELETE ON \\"cases\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION notify_review_change();"}'::jsonb);`.execute(
		db
	);
	await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_outbox_notify_review_change', '{"type":"trigger","name":"outbox_notify_review_change","sql":"CREATE OR REPLACE TRIGGER \\"outbox_notify_review_change\\"\\n  AFTER INSERT OR UPDATE OR DELETE ON \\"outbox\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION notify_review_change();"}'::jsonb);`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`DROP TRIGGER "installations_notify_review_change" ON "installations";`.execute(db);
	await sql`DROP TRIGGER "cases_notify_review_change" ON "cases";`.execute(db);
	await sql`DROP TRIGGER "outbox_notify_review_change" ON "outbox";`.execute(db);
	await sql`DROP FUNCTION notify_review_change;`.execute(db);
	await sql`DELETE FROM "migration_overrides" WHERE "name" = 'function_notify_review_change';`.execute(
		db
	);
	await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_installations_notify_review_change';`.execute(
		db
	);
	await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_cases_notify_review_change';`.execute(
		db
	);
	await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_outbox_notify_review_change';`.execute(
		db
	);
}
