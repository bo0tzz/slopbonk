import { Column, PrimaryColumn, Table, type Generated, type Timestamp } from '@immich/sql-tools';

@Table({ name: 'github_users' })
export class GithubUserTable {
	@PrimaryColumn({ type: 'bigint' })
	id!: number;

	@Column({ type: 'text', unique: true, nullable: true })
	node_id!: string | null;

	@Column({ type: 'text' })
	login!: string;

	@Column({ type: 'timestamp with time zone', nullable: true })
	account_created_at!: Timestamp | null;

	@Column({ type: 'text', nullable: true })
	name!: string | null;

	@Column({ type: 'text', nullable: true })
	bio!: string | null;

	@Column({ type: 'integer', nullable: true })
	followers!: number | null;

	@Column({ type: 'timestamp with time zone', default: () => 'now()' })
	updated_at!: Generated<Timestamp>;
}
