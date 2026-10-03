import { sql } from 'kysely';
import type { RequestHandler } from './$types';
import { getServices } from '$lib/server/services';

export const GET: RequestHandler = async () => {
	try {
		await sql`SELECT 1`.execute(getServices().db);
		return new Response('ok');
	} catch {
		return new Response('database unavailable', { status: 503 });
	}
};
