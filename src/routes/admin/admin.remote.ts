import { error } from '@sveltejs/kit';
import { getRequestEvent, query } from '$app/server';
import { overview } from '$lib/server/admin/overview';
import { isOperator } from '$lib/server/auth/access';
import { rateLimitHolds } from '$lib/server/github/app';
import { getServices } from '$lib/server/services';

export const adminOverview = query(async () => {
	if (!isOperator(getRequestEvent().locals.reviewer)) {
		error(404, 'Not found');
	}
	const { db, queue } = getServices();
	return overview(db, queue, rateLimitHolds());
});
