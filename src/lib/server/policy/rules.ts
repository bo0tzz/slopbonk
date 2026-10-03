import type { SignalName, SignalValue } from './signals';

/** One signal compared against one threshold; contributes its weight when it holds (ADR-0003). */
export interface Rule {
	name: string;
	signal: SignalName;
	atLeast: number;
	weight: number;
}

export interface Ruleset {
	version: string;
	/** Score at which an account enters the review queue. */
	queueThreshold: number;
	rules: Rule[];
}

/**
 * Starting ruleset: "any three of four". Validated on 45 farmers and ~1,000 other commenters
 * (37 caught, no false positives); see ADR-0003 for the method.
 */
export const RULESET: Ruleset = {
	version: '1',
	queueThreshold: 3,
	rules: [
		{ name: 'burst_across_repos', signal: 'peak_repos_24h', atLeast: 3, weight: 1 },
		{ name: 'repos_within_a_minute', signal: 'peak_repos_1m', atLeast: 3, weight: 1 },
		{ name: 'mostly_answers', signal: 'qa_share', atLeast: 0.5, weight: 1 },
		{ name: 'burst_mostly_answers', signal: 'qa_share_burst', atLeast: 0.5, weight: 1 }
	]
};

export interface Score {
	total: number;
	fired: Rule[];
}

export function score(ruleset: Ruleset, signals: SignalValue[]): Score {
	const values = new Map(signals.map((s) => [s.name, s.value]));
	const fired = ruleset.rules.filter((rule) => (values.get(rule.signal) ?? 0) >= rule.atLeast);
	return { total: fired.reduce((sum, rule) => sum + rule.weight, 0), fired };
}
