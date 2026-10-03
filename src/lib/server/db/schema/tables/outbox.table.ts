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
import { DecisionTable } from './decision.table.js';
import { InstallationTable } from './installation.table.js';

export type OutboxAction = 'block_user';
export type OutboxStatus = 'pending' | 'done' | 'failed';

@Table({ name: 'outbox' })
@Check({ name: 'outbox_action_check', expression: `action IN ('block_user')` })
@Check({ name: 'outbox_status_check', expression: `status IN ('pending', 'done', 'failed')` })
@Index({ name: 'outbox_pending_idx', columns: ['created_at'], where: `status = 'pending'` })
export class OutboxTable {
	@PrimaryColumn({ type: 'bigint', identity: true })
	id!: Generated<number>;

	@ForeignKeyColumn(() => DecisionTable, { onDelete: 'CASCADE' })
	decision_id!: number;

	@ForeignKeyColumn(() => InstallationTable, { onDelete: 'CASCADE' })
	installation_id!: number;

	@Column({ type: 'text' })
	action!: OutboxAction;

	@Column({ type: 'bigint' })
	target_user_id!: number;

	@Column({ type: 'text', default: 'pending' })
	status!: Generated<OutboxStatus>;

	@Column({ type: 'integer', default: 0 })
	attempts!: Generated<number>;

	@Column({ type: 'text', nullable: true })
	last_error!: string | null;

	@Column({ type: 'timestamp with time zone', default: () => 'now()' })
	created_at!: Generated<Timestamp>;

	@Column({ type: 'timestamp with time zone', nullable: true })
	completed_at!: Timestamp | null;
}
