import {
	Column,
	ForeignKeyColumn,
	PrimaryColumn,
	Table,
	type Generated,
	type Timestamp
} from '@immich/sql-tools';
import type { JSONColumnType } from 'kysely';
import { GithubUserTable } from './github-user.table.js';
import { InstallationTable } from './installation.table.js';

@Table({ name: 'config_changes' })
export class ConfigChangeTable {
	@PrimaryColumn({ type: 'bigint', identity: true })
	id!: Generated<number>;

	@ForeignKeyColumn(() => InstallationTable, { onDelete: 'CASCADE' })
	installation_id!: number;

	@ForeignKeyColumn(() => GithubUserTable)
	actor_id!: number;

	@Column({ type: 'timestamp with time zone', default: () => 'now()' })
	changed_at!: Generated<Timestamp>;

	@Column({ type: 'jsonb' })
	old_config!: JSONColumnType<Record<string, unknown>>;

	@Column({ type: 'jsonb' })
	new_config!: JSONColumnType<Record<string, unknown>>;
}
