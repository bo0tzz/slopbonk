import { error } from '@sveltejs/kit';
import { getRequestEvent, query } from '$app/server';
import { overview } from '#lib/server/admin/overview.js';
import { isOperator } from '#lib/server/auth/access.js';
import { rateLimitHolds } from '#lib/server/github/app.js';
import { getServices } from '#lib/server/services.js';

export const adminOverview = query(async () => {
	if (!isOperator(getRequestEvent().locals.reviewer)) {
		error(404, 'Not found');
	}
	const { db, queue } = getServices();
	return overview(db, queue, rateLimitHolds());
});
