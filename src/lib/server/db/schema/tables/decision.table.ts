import {
	Check,
	Column,
	ForeignKeyColumn,
	PrimaryColumn,
	Table,
	type Generated,
	type Timestamp
} from '@immich/sql-tools';
import { CaseTable } from './case.table.js';
import { EvaluationTable } from './evaluation.table.js';
import { GithubUserTable } from './github-user.table.js';

export type DecisionAction = 'block' | 'dismiss' | 'unblock';

@Table({ name: 'decisions' })
@Check({
	name: 'decisions_action_check',
	expression: `action IN ('block', 'dismiss', 'unblock')`
})
export class DecisionTable {
	@PrimaryColumn({ type: 'bigint', identity: true })
	id!: Generated<number>;

	@ForeignKeyColumn(() => CaseTable, { onDelete: 'CASCADE' })
	case_id!: number;

	@ForeignKeyColumn(() => GithubUserTable)
	actor_id!: number;

	@Column({ type: 'text' })
	action!: DecisionAction;

	@Column({ type: 'text', nullable: true })
	reason!: string | null;

	@ForeignKeyColumn(() => EvaluationTable, { onDelete: 'SET NULL', nullable: true })
	evaluation_id!: number | null;

	@Column({ type: 'timestamp with time zone', default: () => 'now()' })
	decided_at!: Generated<Timestamp>;
}
