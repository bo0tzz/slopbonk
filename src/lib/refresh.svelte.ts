const INTERVAL_MS = 30 * 1000;

/** Re-runs `refresh` every 30 seconds while the page is visible, and when it becomes visible again. */
export function keepFresh(refresh: () => Promise<unknown>) {
	$effect(() => {
		const run = () => {
			if (document.visibilityState === 'visible') {
				void refresh();
			}
		};
		const timer = setInterval(run, INTERVAL_MS);
		document.addEventListener('visibilitychange', run);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', run);
		};
	});
}
