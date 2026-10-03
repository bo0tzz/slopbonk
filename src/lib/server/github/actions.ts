import type { App } from '@octokit/app';
import { installationOctokit } from './app';

/** Writes slopbonk makes on an installation's behalf (act only). */
export interface GithubActions {
	blockUser(org: string, login: string): Promise<void>;
}

export async function installationActions(
	app: App,
	installationId: number
): Promise<GithubActions> {
	const octokit = await installationOctokit(app, installationId);
	return {
		async blockUser(org, login) {
			try {
				await octokit.request('PUT /orgs/{org}/blocks/{username}', { org, username: login });
			} catch (error) {
				const { status, message } = error as { status?: number; message?: string };
				// GitHub also uses 422 for other refusals (e.g. blocking a member), so check the reason.
				if (status !== 422 || !/already/i.test(message ?? '')) {
					throw error;
				}
			}
		}
	};
}
