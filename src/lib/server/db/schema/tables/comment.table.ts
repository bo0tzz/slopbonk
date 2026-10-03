import {
	Check,
	Column,
	ForeignKeyColumn,
	Index,
	PrimaryColumn,
	Table,
	type Generated,
	type Timestamp
} from '@immich/sql-tools';
import { GithubUserTable } from './github-user.table.js';
import { ThreadTable } from './thread.table.js';

export type CommentSource = 'webhook' | 'backfill' | 'history';

@Table({ name: 'comments' })
@Check({
	name: 'comments_source_check',
	expression: `source IN ('webhook', 'backfill', 'history')`
})
@Index({ name: 'comments_author_created_idx', columns: ['author_id', 'created_at'] })
export class CommentTable {
	@PrimaryColumn({ type: 'text' })
	id!: string;

	@ForeignKeyColumn(() => GithubUserTable, { onDelete: 'CASCADE', index: false })
	author_id!: number;

	@ForeignKeyColumn(() => ThreadTable, { onDelete: 'CASCADE' })
	thread_id!: string;

	@Column({ type: 'text' })
	author_association!: string;

	@Column({ type: 'boolean', default: false })
	is_answer!: Generated<boolean>;

	@Column({ type: 'text' })
	body!: string;

	@Column({ type: 'timestamp with time zone' })
	created_at!: Timestamp;

	@Column({ type: 'timestamp with time zone', nullable: true })
	edited_at!: Timestamp | null;

	@Column({ type: 'text' })
	source!: CommentSource;

	@Column({ type: 'timestamp with time zone', default: () => 'now()' })
	fetched_at!: Generated<Timestamp>;
}
