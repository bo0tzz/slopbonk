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

export const REVIEW_CHANGES_CHANNEL = 'slopbonk_review_changes';

/** Tells listeners which installation, and which account if any, a changed row belongs to. */
export const notify_review_change = registerFunction({
	name: 'notify_review_change',
	returnType: 'TRIGGER',
	language: 'PLPGSQL',
	body: `
		DECLARE
			changed jsonb := to_jsonb(COALESCE(NEW, OLD));
		BEGIN
			PERFORM pg_notify('${REVIEW_CHANGES_CHANNEL}', json_build_object(
				'table', TG_TABLE_NAME,
				'installationId', COALESCE(changed->>'installation_id', changed->>'id')::bigint,
				'userId', COALESCE(changed->>'user_id', changed->>'target_user_id')::bigint
			)::text);
			RETURN NULL;
		END`
});
