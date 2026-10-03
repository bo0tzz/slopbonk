import { Column, PrimaryColumn, Table } from '@immich/sql-tools';

@Table({ name: 'repositories' })
export class RepositoryTable {
	@PrimaryColumn({ type: 'bigint' })
	id!: number;

	@Column({ type: 'text', unique: true })
	node_id!: string;

	@Column({ type: 'bigint' })
	owner_id!: number;

	@Column({ type: 'text' })
	owner_login!: string;

	@Column({ type: 'text' })
	name!: string;
}
