import type { RequestHandler } from './$types';
import { getServices } from '$lib/server/services';

const KEEPALIVE_MS = 25 * 1000;

/**
 * Server-sent events telling the reviewer's pages that something they show has changed, so they
 * can refresh. Only changes in installations the reviewer can access are sent, and only which
 * installation and account changed, not what.
 */
export const GET: RequestHandler = ({ locals, request }) => {
	const reviewer = locals.reviewer;
	if (!reviewer) {
		// 204 tells EventSource to stop reconnecting.
		return new Response(null, { status: 204 });
	}
	const encoder = new TextEncoder();
	let close = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let closed = false;
			const send = (text: string) => {
				if (!closed) {
					controller.enqueue(encoder.encode(text));
				}
			};
			const unsubscribe = getServices().reviewChanges.subscribe((change) => {
				if (change.table === 'installations') {
					send(`data: ${JSON.stringify({ installations: true })}\n\n`);
				} else if (reviewer.installationIds.includes(change.installationId)) {
					const { installationId, userId } = change;
					send(`data: ${JSON.stringify({ installationId, userId })}\n\n`);
				}
			});
			const keepalive = setInterval(() => send(': keepalive\n\n'), KEEPALIVE_MS);
			close = () => {
				closed = true;
				clearInterval(keepalive);
				unsubscribe();
			};
			request.signal.addEventListener('abort', () => close());
		},
		cancel() {
			close();
		}
	});
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no'
		}
	});
};
