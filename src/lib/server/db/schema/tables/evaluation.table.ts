import {
	Column,
	ForeignKeyColumn,
	Index,
	PrimaryColumn,
	Table,
	type Generated,
	type Timestamp
} from '@immich/sql-tools';
import { GithubUserTable } from './github-user.table.js';

@Table({ name: 'evaluations' })
@Index({ name: 'evaluations_user_evaluated_idx', columns: ['user_id', 'evaluated_at'] })
export class EvaluationTable {
	@PrimaryColumn({ type: 'bigint', identity: true })
	id!: Generated<number>;

	@ForeignKeyColumn(() => GithubUserTable, { onDelete: 'CASCADE', index: false })
	user_id!: number;

	@Column({ type: 'timestamp with time zone', default: () => 'now()' })
	evaluated_at!: Generated<Timestamp>;

	@Column({ type: 'text' })
	ruleset_version!: string;

	@Column({ type: 'timestamp with time zone' })
	data_as_of!: Timestamp;
}
