import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
	await sql`CREATE OR REPLACE FUNCTION insert_only()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS $$
    BEGIN
			RAISE EXCEPTION '% rows are insert-only; add a new version instead', TG_TABLE_NAME;
		END
  $$;`.execute(db);
	await sql`CREATE TABLE "github_users" (
  "id" bigint NOT NULL,
  "node_id" text NOT NULL,
  "login" text NOT NULL,
  "account_created_at" timestamp with time zone NOT NULL,
  "name" text,
  "bio" text,
  "followers" integer,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "github_users_node_id_uq" UNIQUE ("node_id"),
  CONSTRAINT "github_users_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE TABLE "installations" (
  "id" bigint NOT NULL,
  "org_id" bigint NOT NULL,
  "org_login" text NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}',
  "installed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "uninstalled_at" timestamp with time zone,
  CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE TABLE "cases" (
  "id" bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  "installation_id" bigint NOT NULL,
  "user_id" bigint NOT NULL,
  "state" text NOT NULL DEFAULT 'open',
  "score" double precision NOT NULL,
  "dismissed_score" double precision,
  "first_seen_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  CONSTRAINT "cases_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "github_users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "cases_installation_user_uq" UNIQUE ("installation_id", "user_id"),
  CONSTRAINT "cases_state_check" CHECK (state IN ('open', 'blocked', 'dismissed')),
  CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE INDEX "cases_queue_idx" ON "cases" ("installation_id", "state", "score");`.execute(
		db
	);
	await sql`CREATE INDEX "cases_user_id_idx" ON "cases" ("user_id");`.execute(db);
	await sql`CREATE TABLE "repositories" (
  "id" bigint NOT NULL,
  "node_id" text NOT NULL,
  "owner_id" bigint NOT NULL,
  "owner_login" text NOT NULL,
  "name" text NOT NULL,
  CONSTRAINT "repositories_node_id_uq" UNIQUE ("node_id"),
  CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE TABLE "threads" (
  "id" text NOT NULL,
  "repository_id" bigint NOT NULL,
  "kind" text NOT NULL,
  "number" integer NOT NULL,
  "author_id" bigint,
  "category_name" text,
  "category_answerable" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "threads_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "threads_kind_check" CHECK (kind IN ('discussion', 'issue', 'pull_request')),
  CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE INDEX "threads_repository_id_idx" ON "threads" ("repository_id");`.execute(db);
	await sql`CREATE TABLE "comments" (
  "id" text NOT NULL,
  "author_id" bigint NOT NULL,
  "thread_id" text NOT NULL,
  "author_association" text NOT NULL,
  "is_answer" boolean NOT NULL DEFAULT false,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "edited_at" timestamp with time zone,
  "source" text NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "github_users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "comments_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "comments_source_check" CHECK (source IN ('webhook', 'history')),
  CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE INDEX "comments_author_created_idx" ON "comments" ("author_id", "created_at");`.execute(
		db
	);
	await sql`CREATE INDEX "comments_thread_id_idx" ON "comments" ("thread_id");`.execute(db);
	await sql`CREATE TABLE "comment_edits" (
  "id" bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  "comment_id" text NOT NULL,
  "body" text NOT NULL,
  "edited_at" timestamp with time zone NOT NULL,
  CONSTRAINT "comment_edits_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "comment_edits_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE INDEX "comment_edits_comment_id_idx" ON "comment_edits" ("comment_id");`.execute(
		db
	);
	await sql`CREATE TABLE "config_changes" (
  "id" bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  "installation_id" bigint NOT NULL,
  "actor_id" bigint NOT NULL,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "old_config" jsonb NOT NULL,
  "new_config" jsonb NOT NULL,
  CONSTRAINT "config_changes_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "config_changes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "github_users" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "config_changes_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE INDEX "config_changes_installation_id_idx" ON "config_changes" ("installation_id");`.execute(
		db
	);
	await sql`CREATE INDEX "config_changes_actor_id_idx" ON "config_changes" ("actor_id");`.execute(
		db
	);
	await sql`CREATE TABLE "evaluations" (
  "id" bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  "user_id" bigint NOT NULL,
  "evaluated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ruleset_version" text NOT NULL,
  "data_as_of" timestamp with time zone NOT NULL,
  CONSTRAINT "evaluations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "github_users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE INDEX "evaluations_user_evaluated_idx" ON "evaluations" ("user_id", "evaluated_at");`.execute(
		db
	);
	await sql`CREATE TABLE "decisions" (
  "id" bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  "case_id" bigint NOT NULL,
  "actor_id" bigint NOT NULL,
  "action" text NOT NULL,
  "reason" text,
  "evaluation_id" bigint,
  "decided_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "decisions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "decisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "github_users" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "decisions_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations" ("id") ON UPDATE NO ACTION ON DELETE SET NULL,
  CONSTRAINT "decisions_action_check" CHECK (action IN ('block', 'dismiss', 'unblock', 'hide', 'delete')),
  CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE INDEX "decisions_case_id_idx" ON "decisions" ("case_id");`.execute(db);
	await sql`CREATE INDEX "decisions_actor_id_idx" ON "decisions" ("actor_id");`.execute(db);
	await sql`CREATE INDEX "decisions_evaluation_id_idx" ON "decisions" ("evaluation_id");`.execute(
		db
	);
	await sql`CREATE TABLE "outbox" (
  "id" bigint NOT NULL GENERATED ALWAYS AS IDENTITY,
  "decision_id" bigint NOT NULL,
  "installation_id" bigint NOT NULL,
  "action" text NOT NULL,
  "target_user_id" bigint,
  "target_comment_id" text,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  CONSTRAINT "outbox_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "decisions" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "outbox_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "installations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "outbox_single_target_check" CHECK ((target_user_id IS NULL) <> (target_comment_id IS NULL)),
  CONSTRAINT "outbox_status_check" CHECK (status IN ('pending', 'done', 'failed')),
  CONSTRAINT "outbox_action_check" CHECK (action IN ('block_user', 'unblock_user', 'minimize_comment', 'delete_comment')),
  CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);`.execute(db);
	await sql`CREATE INDEX "outbox_pending_idx" ON "outbox" ("created_at") WHERE (status = 'pending');`.execute(
		db
	);
	await sql`CREATE INDEX "outbox_decision_id_idx" ON "outbox" ("decision_id");`.execute(db);
	await sql`CREATE INDEX "outbox_installation_id_idx" ON "outbox" ("installation_id");`.execute(db);
	await sql`CREATE TABLE "signal_definitions" (
  "name" text NOT NULL,
  "version" integer NOT NULL,
  "description" text NOT NULL,
  CONSTRAINT "signal_definitions_pkey" PRIMARY KEY ("name", "version")
);`.execute(db);
	await sql`CREATE OR REPLACE TRIGGER "signal_definitions_insert_only"
  BEFORE UPDATE OR DELETE ON "signal_definitions"
  FOR EACH ROW
  EXECUTE FUNCTION insert_only();`.execute(db);
	await sql`CREATE TABLE "signal_values" (
  "evaluation_id" bigint NOT NULL,
  "signal_name" text NOT NULL,
  "signal_version" integer NOT NULL,
  "value" double precision NOT NULL,
  CONSTRAINT "signal_values_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "signal_values_signal_name_signal_version_fkey" FOREIGN KEY ("signal_name", "signal_version") REFERENCES "signal_definitions" ("name", "version") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "signal_values_pkey" PRIMARY KEY ("evaluation_id", "signal_name")
);`.execute(db);
	await sql`CREATE INDEX "signal_values_signal_name_signal_version_idx" ON "signal_values" ("signal_name", "signal_version");`.execute(
		db
	);
	await sql`CREATE TABLE "tracked_users" (
  "user_id" bigint NOT NULL,
  "last_fetched_at" timestamp with time zone,
  "history_from" timestamp with time zone,
  "gone_at" timestamp with time zone,
  CONSTRAINT "tracked_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "github_users" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "tracked_users_pkey" PRIMARY KEY ("user_id")
);`.execute(db);
	await sql`CREATE TABLE "migration_overrides" (
  "name" character varying NOT NULL,
  "value" jsonb NOT NULL,
  CONSTRAINT "migration_overrides_pkey" PRIMARY KEY ("name")
);`.execute(db);
	await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('function_insert_only', '{"type":"function","name":"insert_only","sql":"CREATE OR REPLACE FUNCTION insert_only()\\n  RETURNS TRIGGER\\n  LANGUAGE PLPGSQL\\n  AS $$\\n    BEGIN\\n\\t\\t\\tRAISE EXCEPTION ''% rows are insert-only; add a new version instead'', TG_TABLE_NAME;\\n\\t\\tEND\\n  $$;"}'::jsonb);`.execute(
		db
	);
	await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('index_outbox_pending_idx', '{"type":"index","name":"outbox_pending_idx","sql":"CREATE INDEX \\"outbox_pending_idx\\" ON \\"outbox\\" (\\"created_at\\") WHERE (status = ''pending'');"}'::jsonb);`.execute(
		db
	);
	await sql`INSERT INTO "migration_overrides" ("name", "value") VALUES ('trigger_signal_definitions_insert_only', '{"type":"trigger","name":"signal_definitions_insert_only","sql":"CREATE OR REPLACE TRIGGER \\"signal_definitions_insert_only\\"\\n  BEFORE UPDATE OR DELETE ON \\"signal_definitions\\"\\n  FOR EACH ROW\\n  EXECUTE FUNCTION insert_only();"}'::jsonb);`.execute(
		db
	);
}

export async function down(db: Kysely<any>): Promise<void> {
	await sql`DROP TRIGGER "signal_definitions_insert_only" ON "signal_definitions";`.execute(db);
	await sql`DROP FUNCTION insert_only;`.execute(db);
	await sql`DROP TABLE "outbox";`.execute(db);
	await sql`DROP TABLE "decisions";`.execute(db);
	await sql`DROP TABLE "cases";`.execute(db);
	await sql`DROP TABLE "comment_edits";`.execute(db);
	await sql`DROP TABLE "comments";`.execute(db);
	await sql`DROP TABLE "config_changes";`.execute(db);
	await sql`DROP TABLE "signal_values";`.execute(db);
	await sql`DROP TABLE "evaluations";`.execute(db);
	await sql`DROP TABLE "tracked_users";`.execute(db);
	await sql`DROP TABLE "github_users";`.execute(db);
	await sql`DROP TABLE "installations";`.execute(db);
	await sql`DROP TABLE "threads";`.execute(db);
	await sql`DROP TABLE "repositories";`.execute(db);
	await sql`DROP TABLE "signal_definitions";`.execute(db);
	await sql`DELETE FROM "migration_overrides" WHERE "name" = 'function_insert_only';`.execute(db);
	await sql`DELETE FROM "migration_overrides" WHERE "name" = 'index_outbox_pending_idx';`.execute(
		db
	);
	await sql`DELETE FROM "migration_overrides" WHERE "name" = 'trigger_signal_definitions_insert_only';`.execute(
		db
	);
	await sql`DROP TABLE "migration_overrides";`.execute(db);
}
