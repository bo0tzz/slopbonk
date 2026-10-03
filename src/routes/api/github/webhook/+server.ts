import type { RequestHandler } from './$types';
import { forgetIdentities } from '$lib/server/auth/session';
import { handleWebhookRequest } from '$lib/server/ingest/webhook';
import { getServices } from '$lib/server/services';

export const POST: RequestHandler = ({ request }) => {
	const { db, queue, webhookSecret } = getServices();
	return handleWebhookRequest(request, {
		db,
		queue,
		secret: webhookSecret,
		onInstallationsChanged: forgetIdentities
	});
};
