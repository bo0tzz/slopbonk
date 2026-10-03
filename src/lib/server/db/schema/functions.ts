import { registerFunction } from '@immich/sql-tools';

export const insert_only = registerFunction({
	name: 'insert_only',
	returnType: 'TRIGGER',
	language: 'PLPGSQL',
	body: `
		BEGIN
			RAISE EXCEPTION '% rows are insert-only; add a new version instead', TG_TABLE_NAME;
		END`
});
