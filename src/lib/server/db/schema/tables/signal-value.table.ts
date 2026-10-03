import {
	Column,
	ForeignKeyColumn,
	ForeignKeyConstraint,
	PrimaryColumn,
	Table
} from '@immich/sql-tools';
import { EvaluationTable } from './evaluation.table.js';
import { SignalDefinitionTable } from './signal-definition.table.js';

@Table({ name: 'signal_values' })
@ForeignKeyConstraint({
	columns: ['signal_name', 'signal_version'],
	referenceTable: () => SignalDefinitionTable,
	referenceColumns: ['name', 'version']
})
export class SignalValueTable {
	@ForeignKeyColumn(() => EvaluationTable, { primary: true, onDelete: 'CASCADE', index: false })
	evaluation_id!: number;

	@PrimaryColumn({ type: 'text' })
	signal_name!: string;

	@Column({ type: 'integer' })
	signal_version!: number;

	@Column({ type: 'double precision' })
	value!: number;
}
