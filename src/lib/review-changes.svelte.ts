export type ReviewChangeEvent =
	{ installations: true } | { installationId: number; userId: number | null };

/** Batches bursts, such as an evaluation updating many cases, into one refresh. */
const SETTLE_MS = 500;

/**
 * Calls `onChange` when the server reports a change the page might show. `relevant` picks the
 * changes that matter to the page.
 */
export function onReviewChange(
	relevant: (event: ReviewChangeEvent) => boolean,
	onChange: () => Promise<unknown>
) {
	$effect(() => {
		const events = new EventSource('/api/events');
		let timer: ReturnType<typeof setTimeout> | undefined;
		events.onmessage = (message) => {
			if (!relevant(JSON.parse(message.data))) {
				return;
			}
			clearTimeout(timer);
			timer = setTimeout(() => void onChange(), SETTLE_MS);
		};
		return () => {
			clearTimeout(timer);
			events.close();
		};
	});
}
