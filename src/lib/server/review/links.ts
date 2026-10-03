import type { ThreadKind } from '../db/schema/tables/thread.table';

export function threadUrl(owner: string, repo: string, kind: ThreadKind, number: number): string {
	const path = { discussion: 'discussions', issue: 'issues', pull_request: 'pull' }[kind];
	return `https://github.com/${owner}/${repo}/${path}/${number}`;
}

/** GitHub's own "Report abuse" link for an account (ADR-0006). */
export function reportUrl(login: string): string {
	return `https://github.com/contact/report-abuse?report=${encodeURIComponent(`${login} (user)`)}`;
}
