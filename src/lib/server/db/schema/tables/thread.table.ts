import {
	Check,
	Column,
	ForeignKeyColumn,
	PrimaryColumn,
	Table,
	type Generated,
	type Timestamp
} from '@immich/sql-tools';
import { RepositoryTable } from './repository.table.js';

export type ThreadKind = 'discussion' | 'issue' | 'pull_request';

@Table({ name: 'threads' })
@Check({
	name: 'threads_kind_check',
	expression: `kind IN ('discussion', 'issue', 'pull_request')`
})
export class ThreadTable {
	@PrimaryColumn({ type: 'text' })
	id!: string;

	@ForeignKeyColumn(() => RepositoryTable, { onDelete: 'CASCADE' })
	repository_id!: number;

	@Column({ type: 'text' })
	kind!: ThreadKind;

	@Column({ type: 'integer' })
	number!: number;

	@Column({ type: 'bigint', nullable: true })
	author_id!: number | null;

	@Column({ type: 'text', nullable: true })
	category_name!: string | null;

	@Column({ type: 'boolean', default: false })
	category_answerable!: Generated<boolean>;

	@Column({ type: 'timestamp with time zone' })
	created_at!: Timestamp;
}
