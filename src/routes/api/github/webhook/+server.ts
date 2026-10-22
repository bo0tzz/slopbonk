import type { RequestHandler } from './$types';
import { forgetIdentities } from '#lib/server/auth/session.js';
import { handleWebhookRequest } from '#lib/server/ingest/webhook.js';
import { getServices } from '#lib/server/services.js';

export const POST: RequestHandler = ({ request }) => {
	const { db, queue, webhookSecret } = getServices();
	return handleWebhookRequest(request, {
		db,
		queue,
		secret: webhookSecret,
		onInstallationsChanged: forgetIdentities
	});
};
