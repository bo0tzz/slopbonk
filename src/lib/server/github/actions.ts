import type { App } from '@octokit/app';
import type { Octokit } from '@octokit/core';
import { installationOctokit } from './app';

/** Writes slopbonk makes on an installation's behalf (act only). */
export interface GithubActions {
	blockUser(org: string, login: string): Promise<void>;
	/** Hides a comment as spam; false when the comment no longer exists. */
	minimizeComment(commentId: string): Promise<boolean>;
}

const MINIMIZE_COMMENT = `mutation($id: ID!) {
	minimizeComment(input: { subjectId: $id, classifier: SPAM }) { minimizedComment { isMinimized } }
}`;

const IS_MINIMIZED = `query($id: ID!) { node(id: $id) { ... on Minimizable { isMinimized } } }`;

export async function minimizeComment(octokit: Octokit, commentId: string): Promise<boolean> {
	try {
		await octokit.graphql(MINIMIZE_COMMENT, { id: commentId });
		return true;
	} catch (error) {
		const errors = (error as { errors?: { type?: string }[] }).errors;
		if (errors?.some((e) => e.type === 'NOT_FOUND')) {
			return false;
		}
		// GitHub refuses to minimize a comment that is already hidden, e.g. by a maintainer, and
		// only says "Could not minimize comment".
		const { node } = await octokit.graphql<{ node: { isMinimized?: boolean } | null }>(
			IS_MINIMIZED,
			{ id: commentId }
		);
		if (node?.isMinimized) {
			return true;
		}
		throw error;
	}
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
		},
		minimizeComment: (commentId) => minimizeComment(octokit, commentId)
	};
}
