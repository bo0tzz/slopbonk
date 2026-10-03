import { App } from '@octokit/app';
import type { Octokit } from '@octokit/core';
import type { GithubAppConfig } from '../env';
import { RateLimitedError, rateLimitedUntil } from './rate-limit';

export function createApp(config: GithubAppConfig): App {
	return new App({
		appId: config.appId,
		privateKey: config.privateKey,
		oauth: { clientId: config.clientId, clientSecret: config.clientSecret }
	});
}

const exhaustedUntil = new Map<string, number>();

export async function installationOctokit(app: App, installationId: number): Promise<Octokit> {
	const octokit = await app.getInstallationOctokit(installationId);
	failFastOnRateLimit(octokit, String(installationId));
	return octokit;
}

/**
 * Once GitHub turns a request away for its rate limit, every request under the same budget fails
 * fast until the limit lifts.
 */
export function failFastOnRateLimit(octokit: Octokit, budget: string) {
	const exhausted = (until: Date) => {
		exhaustedUntil.set(budget, until.getTime());
		return new RateLimitedError(until);
	};
	octokit.hook.wrap('request', async (request, options) => {
		const until = exhaustedUntil.get(budget);
		if (until !== undefined && until > Date.now()) {
			throw new RateLimitedError(new Date(until));
		}
		let response: Awaited<ReturnType<typeof request>>;
		try {
			response = await request(options);
		} catch (error) {
			const {
				status,
				response: failed,
				message
			} = error as {
				status?: number;
				response?: { headers?: Record<string, string>; data?: { message?: string } };
				message?: string;
			};
			const limitedUntil = rateLimitedUntil({
				status,
				headers: failed?.headers,
				data: failed?.data,
				message: failed?.data?.message ?? message
			});
			throw limitedUntil ? exhausted(limitedUntil) : error;
		}
		const limitedUntil = rateLimitedUntil(response);
		if (limitedUntil) {
			throw exhausted(limitedUntil);
		}
		return response;
	});
}
