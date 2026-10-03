import { App } from '@octokit/app';
import { Octokit } from '@octokit/core';
import { throttling } from '@octokit/plugin-throttling';
import type { GithubAppConfig } from '../env';

export interface UserProfile {
	id: number;
	node_id: string;
	login: string;
	type: string;
	created_at: string;
	name: string | null;
	bio: string | null;
	followers: number;
}

interface Account {
	login: string;
	databaseId?: number;
}

interface RepositoryNode {
	databaseId: number;
	id: string;
	name: string;
	owner: Account;
}

interface ThreadNode {
	id: string;
	number: number;
	createdAt: string;
	author: { databaseId?: number } | null;
}

export interface DiscussionCommentNode {
	id: string;
	createdAt: string;
	lastEditedAt: string | null;
	isAnswer: boolean;
	body: string;
	authorAssociation: string;
	discussion:
		| (ThreadNode & {
				category: { name: string; isAnswerable: boolean };
				repository: RepositoryNode;
		  })
		| null;
}

export interface IssueCommentNode {
	id: string;
	createdAt: string;
	lastEditedAt: string | null;
	body: string;
	authorAssociation: string;
	repository: RepositoryNode | null;
	issue: ThreadNode | null;
	pullRequest: ThreadNode | null;
}

/** Newest-first page of a user's comments; `cursor` fetches the next (older) page. */
export interface HistoryPage<T> {
	nodes: T[];
	cursor: string | null;
	hasOlder: boolean;
}

export interface GithubClient {
	/** Null when the account no longer exists or is suspended. */
	getUser(id: number): Promise<UserProfile | null>;
	discussionComments(
		login: string,
		cursor: string | null
	): Promise<HistoryPage<DiscussionCommentNode>>;
	issueComments(login: string, cursor: string | null): Promise<HistoryPage<IssueCommentNode>>;
}

const ACCOUNT = 'login ... on User { databaseId } ... on Organization { databaseId }';
const REPOSITORY = `databaseId id name owner { ${ACCOUNT} }`;
const THREAD = 'id number createdAt author { ... on User { databaseId } }';

const DISCUSSION_COMMENTS = `query($login: String!, $cursor: String) {
	user(login: $login) {
		repositoryDiscussionComments(last: 100, before: $cursor) {
			pageInfo { startCursor hasPreviousPage }
			nodes {
				id createdAt lastEditedAt isAnswer body authorAssociation
				discussion { ${THREAD} category { name isAnswerable } repository { ${REPOSITORY} } }
			}
		}
	}
}`;

const ISSUE_COMMENTS = `query($login: String!, $cursor: String) {
	user(login: $login) {
		issueComments(last: 100, before: $cursor) {
			pageInfo { startCursor hasPreviousPage }
			nodes {
				id createdAt lastEditedAt body authorAssociation
				repository { ${REPOSITORY} }
				issue { ${THREAD} }
				pullRequest { ${THREAD} }
			}
		}
	}
}`;

interface Connection<T> {
	pageInfo: { startCursor: string | null; hasPreviousPage: boolean };
	nodes: (T | null)[];
}

function toPage<T>(connection: Connection<T> | undefined): HistoryPage<T> {
	if (!connection) {
		return { nodes: [], cursor: null, hasOlder: false };
	}
	return {
		// GitHub returns pages oldest-first; callers expect newest-first.
		nodes: connection.nodes.filter((node): node is T => node !== null).reverse(),
		cursor: connection.pageInfo.startCursor,
		hasOlder: connection.pageInfo.hasPreviousPage
	};
}

const ThrottledOctokit = Octokit.plugin(throttling).defaults({
	throttle: {
		onRateLimit: (_retryAfter: number, _options: object, _octokit: Octokit, retryCount: number) =>
			retryCount < 2,
		onSecondaryRateLimit: (
			_retryAfter: number,
			_options: object,
			_octokit: Octokit,
			retryCount: number
		) => retryCount < 2
	}
});

export function createApp(config: GithubAppConfig): App {
	return new App({ appId: config.appId, privateKey: config.privateKey, Octokit: ThrottledOctokit });
}

export async function installationClient(app: App, installationId: number): Promise<GithubClient> {
	const octokit = await app.getInstallationOctokit(installationId);
	return {
		async getUser(id) {
			try {
				const { data } = await octokit.request('GET /user/{account_id}', { account_id: id });
				return data as UserProfile;
			} catch (error) {
				if ((error as { status?: number }).status === 404) {
					return null;
				}
				throw error;
			}
		},
		async discussionComments(login, cursor) {
			const data = await octokit.graphql<{
				user: { repositoryDiscussionComments: Connection<DiscussionCommentNode> } | null;
			}>(DISCUSSION_COMMENTS, { login, cursor });
			return toPage(data.user?.repositoryDiscussionComments);
		},
		async issueComments(login, cursor) {
			const data = await octokit.graphql<{
				user: { issueComments: Connection<IssueCommentNode> } | null;
			}>(ISSUE_COMMENTS, { login, cursor });
			return toPage(data.user?.issueComments);
		}
	};
}
