import type { GithubClient } from '../github/client';

/** A client whose methods fail unless the test provides them. */
export function fakeGithubClient(methods: Partial<GithubClient>): GithubClient {
	const missing = (name: string) => async () => {
		throw new Error(`GithubClient.${name} isn't stubbed in this test`);
	};
	return {
		getUser: missing('getUser'),
		discussionComments: missing('discussionComments'),
		issueComments: missing('issueComments'),
		installationRepositories: missing('installationRepositories'),
		recentThreads: missing('recentThreads'),
		olderComments: missing('olderComments'),
		...methods
	};
}
