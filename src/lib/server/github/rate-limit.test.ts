import { Octokit } from '@octokit/core';
import { describe, expect, it } from 'vitest';
import { failFastOnRateLimit } from './app';
import { RateLimitedError, rateLimitedUntil } from './rate-limit';

const now = Date.parse('2026-10-03T12:00:00Z');

describe('rateLimitedUntil', () => {
	it('waits for the reset of an exhausted primary limit', () => {
		const reset = now / 1000 + 600;
		expect(
			rateLimitedUntil(
				{
					status: 403,
					headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }
				},
				now
			)
		).toEqual(new Date(reset * 1000));
	});

	it('follows retry-after for secondary limits', () => {
		expect(rateLimitedUntil({ status: 429, headers: { 'retry-after': '30' } }, now)).toEqual(
			new Date(now + 30_000)
		);
	});

	it('waits a minute for a secondary limit that gives no time', () => {
		expect(
			rateLimitedUntil({ status: 403, message: 'You have exceeded a secondary rate limit' }, now)
		).toEqual(new Date(now + 60_000));
	});

	it('recognises GraphQL answering RATE_LIMITED', () => {
		expect(
			rateLimitedUntil({ status: 200, data: { errors: [{ type: 'RATE_LIMITED' }] } }, now)
		).toEqual(new Date(now + 60_000));
	});

	it('leaves other failures alone', () => {
		expect(rateLimitedUntil({ status: 403, message: 'Resource not accessible' }, now)).toBeNull();
		expect(rateLimitedUntil({ status: 404 }, now)).toBeNull();
		expect(
			rateLimitedUntil({ status: 200, data: { errors: [{ type: 'NOT_FOUND' }] } }, now)
		).toBeNull();
	});
});

describe('failFastOnRateLimit', () => {
	it('stops calling GitHub for that budget until the limit lifts', async () => {
		let calls = 0;
		const reset = Math.floor(Date.now() / 1000) + 600;
		const fetch = async () => {
			calls++;
			return new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
				status: 403,
				headers: {
					'content-type': 'application/json',
					'x-ratelimit-remaining': '0',
					'x-ratelimit-reset': String(reset)
				}
			});
		};
		const limited = new Octokit({ request: { fetch } });
		failFastOnRateLimit(limited, 'test-budget');
		const other = new Octokit({ request: { fetch } });
		failFastOnRateLimit(other, 'test-budget');

		await expect(limited.request('GET /user')).rejects.toBeInstanceOf(RateLimitedError);
		await expect(other.request('GET /user')).rejects.toEqual(
			new RateLimitedError(new Date(reset * 1000))
		);
		expect(calls).toBe(1);
	});
});
