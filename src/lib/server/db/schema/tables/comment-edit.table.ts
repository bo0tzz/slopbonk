import {
	Column,
	ForeignKeyColumn,
	PrimaryColumn,
	Table,
	Unique,
	type Generated,
	type Timestamp
} from '@immich/sql-tools';
import { CommentTable } from './comment.table.js';

@Table({ name: 'comment_edits' })
@Unique({ columns: ['comment_id', 'edited_at'] })
export class CommentEditTable {
	@PrimaryColumn({ type: 'bigint', identity: true })
	id!: Generated<number>;

	@ForeignKeyColumn(() => CommentTable, { onDelete: 'CASCADE' })
	comment_id!: string;

	@Column({ type: 'text' })
	body!: string;

	@Column({ type: 'timestamp with time zone' })
	edited_at!: Timestamp;
}
