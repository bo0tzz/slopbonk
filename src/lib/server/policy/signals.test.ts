import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUEUE_THRESHOLD } from '../constants';
import { RULESET, score } from './rules';
import {
	burstAnswerShare,
	computeSignals,
	outwardComments,
	peakDistinctRepos,
	qaShare,
	type ActivityComment
} from './signals';

const at = (iso: string, repositoryId: number, overrides: Partial<ActivityComment> = {}) => ({
	createdAt: new Date(iso),
	repositoryId,
	repositoryOwnerId: 100 + repositoryId,
	threadAuthorId: 200,
	authorAssociation: 'NONE',
	answerable: true,
	...overrides
});

describe('peakDistinctRepos', () => {
	it('finds the window with the most distinct repositories', () => {
		const comments = [
			at('2026-10-01T00:00:00Z', 1),
			at('2026-10-01T00:00:10Z', 1),
			at('2026-10-02T00:00:00Z', 2),
			at('2026-10-02T00:00:30Z', 3),
			at('2026-10-02T00:00:50Z', 4),
			at('2026-10-02T00:05:00Z', 5)
		];
		expect(peakDistinctRepos(comments, 60_000)).toBe(3);
		expect(peakDistinctRepos(comments, 24 * 3600_000)).toBe(4);
	});

	it('handles no comments', () => {
		expect(peakDistinctRepos([], 60_000)).toBe(0);
		expect(burstAnswerShare([], 60_000, 3)).toBe(0);
		expect(qaShare([])).toBe(0);
	});
});

describe('burstAnswerShare', () => {
	it('looks at the most answer-heavy multi-repo burst, not the busiest one', () => {
		const comments = [
			// The busiest day: issue comments in four repos.
			at('2026-09-01T00:00:00Z', 1, { answerable: false }),
			at('2026-09-01T01:00:00Z', 2, { answerable: false }),
			at('2026-09-01T02:00:00Z', 3, { answerable: false }),
			at('2026-09-01T03:00:00Z', 4, { answerable: false }),
			// A smaller burst of answers in three repos.
			at('2026-10-01T00:00:00Z', 5),
			at('2026-10-01T00:00:01Z', 6),
			at('2026-10-01T00:00:02Z', 7),
			// Answers in a single repo don't count as a burst.
			at('2026-10-05T00:00:00Z', 8),
			at('2026-10-05T00:00:01Z', 8)
		];
		expect(burstAnswerShare(comments, 24 * 3600_000, 3)).toBe(1);
		expect(burstAnswerShare(comments.slice(0, 4), 24 * 3600_000, 3)).toBe(0);
	});
});

describe('outwardComments', () => {
	it('drops own repos, own threads and repos the account belongs to', () => {
		const userId = 1;
		const comments = [
			at('2026-10-01T00:00:00Z', 1),
			at('2026-10-01T00:01:00Z', 2, { repositoryOwnerId: userId }),
			at('2026-10-01T00:02:00Z', 3, { threadAuthorId: userId }),
			at('2026-10-01T00:03:00Z', 4, { authorAssociation: 'MEMBER' }),
			at('2026-10-01T00:04:00Z', 5, { authorAssociation: 'CONTRIBUTOR' })
		];
		expect(outwardComments(userId, comments).map((c) => c.repositoryId)).toEqual([1, 5]);
	});
});

/** Anonymised histories of real accounts from validation: account id 1, other ids renumbered. */
function fixture(name: string): ActivityComment[] {
	const raw = JSON.parse(
		readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')
	) as (Omit<ActivityComment, 'createdAt'> & { createdAt: string })[];
	return raw.map((c) => ({ ...c, createdAt: new Date(c.createdAt) }));
}

describe('starting ruleset on real accounts', () => {
	const total = (name: string) => score(RULESET, computeSignals(1, fixture(name))).total;

	it.each(['farmer-a', 'farmer-b', 'farmer-c', 'farmer-d', 'farmer-e'])(
		'queues comment farmer %s',
		(name) => {
			expect(total(name)).toBeGreaterThanOrEqual(QUEUE_THRESHOLD);
		}
	);

	it.each(['human-a', 'human-b', 'human-c', 'human-d', 'human-e'])(
		'leaves busy maintainer %s alone',
		(name) => {
			expect(total(name)).toBeLessThan(QUEUE_THRESHOLD);
		}
	);
});
