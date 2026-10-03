import { Column, PrimaryColumn, Table, TriggerFunction } from '@immich/sql-tools';
import { insert_only } from '../functions.js';

@Table({ name: 'signal_definitions' })
@TriggerFunction({
	name: 'signal_definitions_insert_only',
	timing: 'before',
	actions: ['update', 'delete'],
	scope: 'row',
	function: insert_only
})
export class SignalDefinitionTable {
	@PrimaryColumn({ type: 'text' })
	name!: string;

	@PrimaryColumn({ type: 'integer' })
	version!: number;

	@Column({ type: 'text' })
	description!: string;
}
