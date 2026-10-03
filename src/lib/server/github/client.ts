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

export interface RepositoryNode {
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

export type RecentThreadKind = 'discussion' | 'issue' | 'pull_request';

export interface RecentComment {
	id: string;
	createdAt: string;
	lastEditedAt: string | null;
	/** Only discussion comments can be answers. */
	isAnswer?: boolean;
	body: string;
	authorAssociation: string;
	author: { __typename: string; login: string; id?: string; databaseId?: number } | null;
	/** Top-level discussion comments only. */
	replyCount?: number;
}

/** Comments newest first; `cursor` continues with older ones while `hasOlder`. */
export interface CommentPage {
	comments: RecentComment[];
	cursor: string | null;
	hasOlder: boolean;
}

export interface RecentThread extends ThreadNode {
	updatedAt: string;
	category?: { name: string; isAnswerable: boolean };
	/** The latest 100 top-level comments. */
	comments: CommentPage;
}

/** A repository's threads, most recently updated first; `cursor` fetches the next page. */
export interface ThreadPage {
	threads: RecentThread[];
	cursor: string | null;
	hasMore: boolean;
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
	installationRepositories(): Promise<RepositoryNode[]>;
	recentThreads(
		kind: RecentThreadKind,
		repository: { owner: string; name: string },
		cursor: string | null
	): Promise<ThreadPage>;
	/** Older top-level comments of a thread, or the replies to a discussion comment. */
	olderComments(id: string, cursor: string | null): Promise<CommentPage>;
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

const COMMENT_FIELDS =
	'id createdAt lastEditedAt body authorAssociation author { __typename login ... on User { id databaseId } }';
const DISCUSSION_COMMENT_FIELDS = `${COMMENT_FIELDS} isAnswer replies { totalCount }`;
const REPLY_FIELDS = `${COMMENT_FIELDS} isAnswer`;
const commentConnection = (fields: string) =>
	`pageInfo { startCursor hasPreviousPage } nodes { ${fields} }`;

const RECENT_THREAD_FIELDS: Record<
	RecentThreadKind,
	[connection: string, threadFields: string, commentFields: string]
> = {
	discussion: ['discussions', 'category { name isAnswerable }', DISCUSSION_COMMENT_FIELDS],
	issue: ['issues', '', COMMENT_FIELDS],
	pull_request: ['pullRequests', '', COMMENT_FIELDS]
};

function recentThreadsQuery(kind: RecentThreadKind): string {
	const [connection, threadFields, commentFields] = RECENT_THREAD_FIELDS[kind];
	return `query($owner: String!, $name: String!, $cursor: String) {
	repository(owner: $owner, name: $name) {
		${connection}(first: 25, after: $cursor, orderBy: { field: UPDATED_AT, direction: DESC }) {
			pageInfo { endCursor hasNextPage }
			nodes {
				${THREAD} updatedAt ${threadFields}
				comments(last: 100) { ${commentConnection(commentFields)} }
			}
		}
	}
}`;
}

const OLDER_COMMENTS = `query($id: ID!, $cursor: String) {
	node(id: $id) {
		... on Discussion {
			discussionComments: comments(last: 100, before: $cursor) { ${commentConnection(DISCUSSION_COMMENT_FIELDS)} }
		}
		... on Issue {
			issueComments: comments(last: 100, before: $cursor) { ${commentConnection(COMMENT_FIELDS)} }
		}
		... on PullRequest {
			pullRequestComments: comments(last: 100, before: $cursor) { ${commentConnection(COMMENT_FIELDS)} }
		}
		... on DiscussionComment {
			replies(last: 100, before: $cursor) { ${commentConnection(REPLY_FIELDS)} }
		}
	}
}`;

type RawComment = Omit<RecentComment, 'replyCount'> & { replies?: { totalCount: number } };

function toCommentPage(connection: Connection<RawComment> | undefined): CommentPage {
	const page = toPage(connection);
	return {
		comments: page.nodes.map(({ replies, ...comment }) => ({
			...comment,
			replyCount: replies?.totalCount
		})),
		cursor: page.cursor,
		hasOlder: page.hasOlder
	};
}

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

/** Writes slopbonk makes on an installation's behalf (act only). */
export interface GithubActions {
	blockUser(org: string, login: string): Promise<void>;
}

export function createApp(config: GithubAppConfig): App {
	return new App({
		appId: config.appId,
		privateKey: config.privateKey,
		oauth: { clientId: config.clientId, clientSecret: config.clientSecret },
		Octokit: ThrottledOctokit
	});
}

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
			const octokit = new ThrottledOctokit({ auth: accessToken });
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

/**
 * GitHub answers with data plus errors when individual items are inaccessible (e.g. a discussion
 * that was since deleted); those items come back as null and are skipped. Only fail without data.
 */
async function graphqlAllowingPartial<T>(
	octokit: Octokit,
	query: string,
	variables: Record<string, unknown>
): Promise<T> {
	try {
		return await octokit.graphql<T>(query, variables);
	} catch (error) {
		const data = (error as { data?: T }).data;
		if (data) {
			return data;
		}
		throw error;
	}
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
			const data = await graphqlAllowingPartial<{
				user: { repositoryDiscussionComments: Connection<DiscussionCommentNode> } | null;
			}>(octokit, DISCUSSION_COMMENTS, { login, cursor });
			return toPage(data.user?.repositoryDiscussionComments);
		},
		async issueComments(login, cursor) {
			const data = await graphqlAllowingPartial<{
				user: { issueComments: Connection<IssueCommentNode> } | null;
			}>(octokit, ISSUE_COMMENTS, { login, cursor });
			return toPage(data.user?.issueComments);
		},
		async installationRepositories() {
			const repositories: RepositoryNode[] = [];
			for (let page = 1; ; page++) {
				const { data } = await octokit.request('GET /installation/repositories', {
					per_page: 100,
					page
				});
				repositories.push(
					...data.repositories.map((repository) => ({
						databaseId: Number(repository.id),
						id: repository.node_id,
						name: repository.name,
						owner: { login: repository.owner.login, databaseId: Number(repository.owner.id) }
					}))
				);
				if (data.repositories.length < 100) {
					return repositories;
				}
			}
		},
		async recentThreads(kind, repository, cursor) {
			type Node = Omit<RecentThread, 'comments'> & { comments: Connection<RawComment> };
			const [connection] = RECENT_THREAD_FIELDS[kind];
			const data = await graphqlAllowingPartial<{
				repository: Record<
					string,
					{ pageInfo: { endCursor: string | null; hasNextPage: boolean }; nodes: (Node | null)[] }
				> | null;
			}>(octokit, recentThreadsQuery(kind), {
				owner: repository.owner,
				name: repository.name,
				cursor
			});
			const threads = data.repository?.[connection];
			if (!threads) {
				return { threads: [], cursor: null, hasMore: false };
			}
			return {
				threads: threads.nodes
					.filter((node): node is Node => node !== null)
					.map((node) => ({ ...node, comments: toCommentPage(node.comments) })),
				cursor: threads.pageInfo.endCursor,
				hasMore: threads.pageInfo.hasNextPage
			};
		},
		async olderComments(id, cursor) {
			type Comments = Connection<RawComment>;
			const data = await graphqlAllowingPartial<{
				node: {
					discussionComments?: Comments;
					issueComments?: Comments;
					pullRequestComments?: Comments;
					replies?: Comments;
				} | null;
			}>(octokit, OLDER_COMMENTS, { id, cursor });
			const node = data.node;
			return toCommentPage(
				node?.discussionComments ??
					node?.issueComments ??
					node?.pullRequestComments ??
					node?.replies
			);
		}
	};
}

export async function installationActions(
	app: App,
	installationId: number
): Promise<GithubActions> {
	const octokit = await app.getInstallationOctokit(installationId);
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
