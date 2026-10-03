/** GitHub won't serve this installation until `until`; the job should run again then. */
export class RateLimitedError extends Error {
	constructor(readonly until: Date) {
		super(`GitHub rate limit reached; resets at ${until.toISOString()}`);
	}
}

/** GitHub asks for at least a minute when a secondary rate limit says nothing more specific. */
const FALLBACK_WAIT_MS = 60 * 1000;

type Headers = Record<string, string | number | undefined>;

interface Outcome {
	status?: number;
	headers?: Headers;
	data?: unknown;
	message?: string;
}

function graphqlRateLimited(data: unknown): boolean {
	const errors = (data as { errors?: { type?: string }[] } | undefined)?.errors;
	return errors?.some((error) => error.type === 'RATE_LIMITED') ?? false;
}

/** When the rate limit that turned this response away lifts; null if it wasn't rate limited. */
export function rateLimitedUntil(
	{ status, headers = {}, data, message = '' }: Outcome,
	now = Date.now()
): Date | null {
	const exhausted =
		headers['x-ratelimit-remaining'] === '0' || headers['x-ratelimit-remaining'] === 0;
	const retryAfter = Number(headers['retry-after']);
	const limited =
		status === 429 ||
		(status === 403 && (exhausted || retryAfter > 0 || /rate limit/i.test(message))) ||
		graphqlRateLimited(data);
	if (!limited) {
		return null;
	}
	if (retryAfter > 0) {
		return new Date(now + retryAfter * 1000);
	}
	const reset = Number(headers['x-ratelimit-reset']);
	if (exhausted && reset > 0) {
		return new Date(reset * 1000);
	}
	return new Date(now + FALLBACK_WAIT_MS);
}
