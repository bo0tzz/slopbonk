import { Database } from '@immich/sql-tools';
import { insert_only, notify_review_change } from './functions.js';
import { CaseTable } from './tables/case.table.js';
import { CommentEditTable } from './tables/comment-edit.table.js';
import { CommentTable } from './tables/comment.table.js';
import { ConfigChangeTable } from './tables/config-change.table.js';
import { DecisionTable } from './tables/decision.table.js';
import { EvaluationTable } from './tables/evaluation.table.js';
import { GithubUserTable } from './tables/github-user.table.js';
import { InstallationTable } from './tables/installation.table.js';
import { OutboxTable } from './tables/outbox.table.js';
import { RepositoryTable } from './tables/repository.table.js';
import { SignalDefinitionTable } from './tables/signal-definition.table.js';
import { SignalValueTable } from './tables/signal-value.table.js';
import { ThreadTable } from './tables/thread.table.js';
import { TrackedUserTable } from './tables/tracked-user.table.js';

@Database({ name: 'slopbonk' })
export class SlopbonkDatabase {
	tables = [
		GithubUserTable,
		TrackedUserTable,
		RepositoryTable,
		ThreadTable,
		CommentTable,
		CommentEditTable,
		SignalDefinitionTable,
		EvaluationTable,
		SignalValueTable,
		InstallationTable,
		ConfigChangeTable,
		CaseTable,
		DecisionTable,
		OutboxTable
	];
	functions = [insert_only, notify_review_change];
}

export interface DB {
	github_users: GithubUserTable;
	tracked_users: TrackedUserTable;
	repositories: RepositoryTable;
	threads: ThreadTable;
	comments: CommentTable;
	comment_edits: CommentEditTable;
	signal_definitions: SignalDefinitionTable;
	evaluations: EvaluationTable;
	signal_values: SignalValueTable;
	installations: InstallationTable;
	config_changes: ConfigChangeTable;
	cases: CaseTable;
	decisions: DecisionTable;
	outbox: OutboxTable;
}
