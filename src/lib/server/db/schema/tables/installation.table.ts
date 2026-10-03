import {
	Check,
	Column,
	PrimaryColumn,
	Table,
	type Generated,
	type Timestamp
} from '@immich/sql-tools';
import type { JSONColumnType } from 'kysely';

export type AccountType = 'Organization' | 'User';

@Table({ name: 'installations' })
@Check({
	name: 'installations_account_type_check',
	expression: `account_type IN ('Organization', 'User')`
})
export class InstallationTable {
	@PrimaryColumn({ type: 'bigint' })
	id!: number;

	@Column({ type: 'bigint' })
	account_id!: number;

	@Column({ type: 'text' })
	account_login!: string;

	@Column({ type: 'text' })
	account_type!: AccountType;

	@Column({ type: 'jsonb', default: '{}' })
	config!: JSONColumnType<Record<string, unknown>, string | undefined, string>;

	@Column({ type: 'timestamp with time zone', default: () => 'now()' })
	installed_at!: Generated<Timestamp>;

	@Column({ type: 'timestamp with time zone', nullable: true })
	uninstalled_at!: Timestamp | null;
}
