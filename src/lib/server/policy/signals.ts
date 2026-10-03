export interface ActivityComment {
	createdAt: Date;
	repositoryId: number;
	repositoryOwnerId: number;
	threadAuthorId: number | null;
	authorAssociation: string;
	answerable: boolean;
}

/** Associations that make a repository part of the account's own ecosystem. */
const INSIDER_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

/** Comments on other people's threads, in repositories the account doesn't own or belong to. */
export function outwardComments(userId: number, comments: ActivityComment[]): ActivityComment[] {
	return comments
		.filter(
			(c) =>
				c.repositoryOwnerId !== userId &&
				c.threadAuthorId !== userId &&
				!INSIDER_ASSOCIATIONS.has(c.authorAssociation)
		)
		.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

interface WindowStats {
	repos: number;
	comments: number;
	answers: number;
}

/**
 * Every window of the given length that starts at a comment, as distinct repositories, comments
 * and answers in it. `comments` must be sorted by time.
 */
function* slidingWindows(comments: ActivityComment[], windowMs: number): Generator<WindowStats> {
	let end = 0;
	let answers = 0;
	const repos = new Map<number, number>();
	for (let start = 0; start < comments.length; start++) {
		const limit = comments[start].createdAt.getTime() + windowMs;
		while (end < comments.length && comments[end].createdAt.getTime() < limit) {
			const repo = comments[end].repositoryId;
			repos.set(repo, (repos.get(repo) ?? 0) + 1);
			answers += comments[end].answerable ? 1 : 0;
			end++;
		}
		yield { repos: repos.size, comments: end - start, answers };

		const repo = comments[start].repositoryId;
		const remaining = repos.get(repo)! - 1;
		if (remaining === 0) {
			repos.delete(repo);
		} else {
			repos.set(repo, remaining);
		}
		answers -= comments[start].answerable ? 1 : 0;
	}
}

/** Most distinct repositories within any window of the given length. */
export function peakDistinctRepos(comments: ActivityComment[], windowMs: number): number {
	let best = 0;
	for (const window of slidingWindows(comments, windowMs)) {
		best = Math.max(best, window.repos);
	}
	return best;
}

/**
 * Highest answer share in any window of the given length spanning at least `minRepos`
 * repositories: was there ever a multi-repo burst that was mostly answers?
 */
export function burstAnswerShare(
	comments: ActivityComment[],
	windowMs: number,
	minRepos: number
): number {
	let best = 0;
	for (const window of slidingWindows(comments, windowMs)) {
		if (window.repos >= minRepos) {
			best = Math.max(best, window.answers / window.comments);
		}
	}
	return best;
}

export function qaShare(comments: ActivityComment[]): number {
	if (comments.length === 0) {
		return 0;
	}
	return comments.filter((c) => c.answerable).length / comments.length;
}

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Every signal policy computes; rules can only refer to these. */
export type SignalName = 'peak_repos_1m' | 'peak_repos_24h' | 'qa_share' | 'qa_share_burst';

export interface SignalValue {
	name: SignalName;
	version: number;
	value: number;
}

/** The signals the rules use, computed from an account's stored comments. */
export function computeSignals(userId: number, comments: ActivityComment[]): SignalValue[] {
	const outward = outwardComments(userId, comments);
	return [
		{ name: 'peak_repos_1m', version: 1, value: peakDistinctRepos(outward, MINUTE) },
		{ name: 'peak_repos_24h', version: 1, value: peakDistinctRepos(outward, DAY) },
		{ name: 'qa_share', version: 1, value: qaShare(outward) },
		{ name: 'qa_share_burst', version: 1, value: burstAnswerShare(outward, DAY, 3) }
	];
}
