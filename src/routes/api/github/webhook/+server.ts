import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db/instance';
import { githubApp } from '$lib/server/env';
import { handleWebhookRequest } from '$lib/server/ingest/webhook';
import { getJobQueue } from '$lib/server/queue/instance';

export const POST: RequestHandler = ({ request }) =>
	handleWebhookRequest(request, {
		db: getDb(),
		queue: getJobQueue(),
		secret: githubApp().webhookSecret
	});
