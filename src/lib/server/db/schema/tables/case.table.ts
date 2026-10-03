import {
	Check,
	Column,
	ForeignKeyColumn,
	Index,
	PrimaryColumn,
	Table,
	Unique,
	type Generated,
	type Timestamp
} from '@immich/sql-tools';
import { GithubUserTable } from './github-user.table.js';
import { InstallationTable } from './installation.table.js';

export type CaseState = 'open' | 'blocked' | 'dismissed';

@Table({ name: 'cases' })
@Check({ name: 'cases_state_check', expression: `state IN ('open', 'blocked', 'dismissed')` })
@Unique({ name: 'cases_installation_user_uq', columns: ['installation_id', 'user_id'] })
@Index({ name: 'cases_queue_idx', columns: ['installation_id', 'state', 'score'] })
export class CaseTable {
	@PrimaryColumn({ type: 'bigint', identity: true })
	id!: Generated<number>;

	@ForeignKeyColumn(() => InstallationTable, { onDelete: 'CASCADE', index: false })
	installation_id!: number;

	@ForeignKeyColumn(() => GithubUserTable, { onDelete: 'CASCADE' })
	user_id!: number;

	@Column({ type: 'text', default: 'open' })
	state!: Generated<CaseState>;

	@Column({ type: 'double precision' })
	score!: number;

	@Column({ type: 'double precision', nullable: true })
	dismissed_score!: number | null;

	@Column({ type: 'timestamp with time zone' })
	first_seen_at!: Timestamp;

	@Column({ type: 'timestamp with time zone' })
	last_seen_at!: Timestamp;
}
