import { RULESET, score } from '../scoring/rules';
import type { SignalName } from '../scoring/signals';

export interface Stat {
	signal: SignalName;
	value: string;
	label: string;
	description: string;
	/** Whether its rule counted towards the score. */
	fired: boolean;
}

export const MAX_SCORE = RULESET.rules.reduce((sum, rule) => sum + rule.weight, 0);

/** The ruleset's signals, in rule order. */
export function stats(values: Partial<Record<SignalName, number>>): Stat[] {
	const fired = new Set(
		score(
			RULESET,
			Object.entries(values).map(([name, value]) => ({
				name: name as SignalName,
				version: 1,
				value
			}))
		).fired.map((rule) => rule.signal)
	);
	return RULESET.rules.map(({ signal }) => {
		const value = values[signal] ?? 0;
		const percent = `${Math.round(value * 100)}%`;
		const [shown, label, description] = {
			peak_repos_24h: [
				String(value),
				'repos within 24h',
				`${value} different repositories within 24 hours`
			],
			peak_repos_1m: [
				String(value),
				'repos within a minute',
				`${value} different repositories within one minute`
			],
			qa_share: [
				percent,
				'answers overall',
				`${percent} of comments are answers in Q&A discussions`
			],
			qa_share_burst: [
				percent,
				'answers in a burst',
				`${percent} answers in its busiest multi-repository burst`
			]
		}[signal];
		return { signal, value: shown, label, description, fired: fired.has(signal) };
	});
}
