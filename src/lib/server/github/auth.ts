import type { App } from '@octokit/app';
import { Octokit } from '@octokit/core';

export interface UserTokens {
	accessToken: string;
	refreshToken: string | null;
	/** ISO timestamp; null for tokens that don't expire. */
	expiresAt: string | null;
}

export interface UserIdentity {
	id: number;
	nodeId: string;
	login: string;
	/** Installations of this app the user can access. */
	installationIds: number[];
}

/** Reviewer sign-in through the GitHub App's user authorisation (ADR-0008). */
export interface GithubAuth {
	authorizationUrl(state: string, redirectUrl: string): string;
	exchangeCode(code: string, redirectUrl: string): Promise<UserTokens>;
	refresh(refreshToken: string): Promise<UserTokens>;
	revoke(accessToken: string): Promise<void>;
	/** Null when GitHub no longer accepts the token. */
	identify(accessToken: string): Promise<UserIdentity | null>;
}

function userTokens(authentication: {
	token: string;
	refreshToken?: string;
	expiresAt?: string;
}): UserTokens {
	return {
		accessToken: authentication.token,
		refreshToken: authentication.refreshToken ?? null,
		expiresAt: authentication.expiresAt ?? null
	};
}

export function appAuth(app: App): GithubAuth {
	return {
		authorizationUrl(state, redirectUrl) {
			return app.oauth.getWebFlowAuthorizationUrl({ state, redirectUrl }).url;
		},
		async exchangeCode(code, redirectUrl) {
			const { authentication } = await app.oauth.createToken({ code, redirectUrl });
			return userTokens(authentication);
		},
		async refresh(refreshToken) {
			const { authentication } = await app.oauth.refreshToken({ refreshToken });
			return userTokens(authentication);
		},
		async revoke(accessToken) {
			await app.oauth.deleteToken({ token: accessToken });
		},
		async identify(accessToken) {
			const octokit = new Octokit({ auth: accessToken });
			try {
				const { data: user } = await octokit.request('GET /user');
				const installationIds: number[] = [];
				for (let page = 1; ; page++) {
					const { data } = await octokit.request('GET /user/installations', {
						per_page: 100,
						page
					});
					installationIds.push(...data.installations.map((installation) => installation.id));
					if (data.installations.length < 100) {
						break;
					}
				}
				return { id: Number(user.id), nodeId: user.node_id, login: user.login, installationIds };
			} catch (error) {
				if ((error as { status?: number }).status === 401) {
					return null;
				}
				throw error;
			}
		}
	};
}
