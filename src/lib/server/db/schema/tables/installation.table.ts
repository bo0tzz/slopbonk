import { Column, PrimaryColumn, Table, type Generated, type Timestamp } from '@immich/sql-tools';
import type { JSONColumnType } from 'kysely';

@Table({ name: 'installations' })
export class InstallationTable {
	@PrimaryColumn({ type: 'bigint' })
	id!: number;

	@Column({ type: 'bigint' })
	org_id!: number;

	@Column({ type: 'text' })
	org_login!: string;

	@Column({ type: 'jsonb', default: '{}' })
	config!: JSONColumnType<Record<string, unknown>, string | undefined, string>;

	@Column({ type: 'timestamp with time zone', default: () => 'now()' })
	installed_at!: Generated<Timestamp>;

	@Column({ type: 'timestamp with time zone', nullable: true })
	uninstalled_at!: Timestamp | null;
}
