import { Column, ForeignKeyColumn, Table, type Timestamp } from '@immich/sql-tools';
import { GithubUserTable } from './github-user.table.js';

@Table({ name: 'tracked_users' })
export class TrackedUserTable {
	@ForeignKeyColumn(() => GithubUserTable, { primary: true, onDelete: 'CASCADE' })
	user_id!: number;

	@Column({ type: 'timestamp with time zone', nullable: true })
	last_fetched_at!: Timestamp | null;

	@Column({ type: 'timestamp with time zone', nullable: true })
	history_from!: Timestamp | null;

	@Column({ type: 'timestamp with time zone', nullable: true })
	gone_at!: Timestamp | null;
}
