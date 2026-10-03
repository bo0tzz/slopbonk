import { HISTORY_HORIZON_MS } from '../constants';
import type { Db } from '../db';
import type { CaseState } from '../db/schema/tables/case.table';
import type { OutboxStatus } from '../db/schema/tables/outbox.table';
import type { ThreadKind } from '../db/schema/tables/thread.table';
import { RULESET, score } from '../scoring/rules';
import {
	BURST_MIN_REPOS,
	DAY,
	findBurst,
	outwardComments,
	type ActivityComment,
	type SignalName
} from '../scoring/signals';
import { reportUrl, threadUrl } from './links';

const ACTIVITY_DAYS = 30;

export interface ExplainedRule {
	name: string;
	signal: SignalName;
	value: number;
	atLeast: number;
	fired: boolean;
}

export interface EvidenceComment {
	body: string;
	createdAt: Date;
	repository: string;
	url: string;
	kind: ThreadKind;
	category: string | null;
	answerable: boolean;
}

export interface AccountEvidence {
	login: string;
	accountCreatedAt: Date | null;
	followers: number | null;
	caseId: number;
	state: CaseState;
	score: number;
	evaluatedAt: Date | null;
	dataAsOf: Date | null;
	rules: ExplainedRule[];
	commentsHere: EvidenceComment[];
	/** Outward comments per day for the last 30 days, oldest first. */
	activity: { day: string; comments: number }[];
	burst: EvidenceComment[];
	decisions: {
		action: string;
		actor: string;
		decidedAt: Date;
		/** Whether the decision's GitHub action has been carried out; null when there is none. */
		outcome: { status: OutboxStatus; error: string | null } | null;
	}[];
	reportUrl: string;
	reportSummary: string;
}

type Row = ActivityComment & EvidenceComment;

export async function accountEvidence(
	db: Db,
	installation: { id: number; accountId: number; login: string },
	login: string,
	now = new Date()
): Promise<AccountEvidence | null> {
	const found = await db
		.selectFrom('cases')
		.innerJoin('github_users', 'github_users.id', 'cases.user_id')
		.select([
			'cases.id as case_id',
			'cases.state',
			'cases.score',
			'github_users.id as user_id',
			'github_users.login',
			'github_users.account_created_at',
			'github_users.followers'
		])
		.where('cases.installation_id', '=', installation.id)
		.where((eb) => eb(eb.fn('lower', ['github_users.login']), '=', login.toLowerCase()))
		.executeTakeFirst();
	if (!found) {
		return null;
	}

	const evaluation = await db
		.selectFrom('evaluations')
		.select(['id', 'evaluated_at', 'data_as_of'])
		.where('user_id', '=', found.user_id)
		.orderBy('evaluated_at', 'desc')
		.limit(1)
		.executeTakeFirst();
	const signals = evaluation
		? await db
				.selectFrom('signal_values')
				.select(['signal_name', 'signal_version', 'value'])
				.where('evaluation_id', '=', evaluation.id)
				.execute()
		: [];
	const values = new Map(signals.map((s) => [s.signal_name, s.value]));
	const fired = new Set(
		score(
			RULESET,
			signals.map((s) => ({
				name: s.signal_name as SignalName,
				version: s.signal_version,
				value: s.value
			}))
		).fired.map((rule) => rule.name)
	);

	const rows: Row[] = (
		await db
			.selectFrom('comments')
			.innerJoin('threads', 'threads.id', 'comments.thread_id')
			.innerJoin('repositories', 'repositories.id', 'threads.repository_id')
			.select([
				'comments.body',
				'comments.created_at',
				'comments.author_association',
				'threads.kind',
				'threads.number',
				'threads.author_id',
				'threads.category_name',
				'threads.category_answerable',
				'repositories.id as repository_id',
				'repositories.owner_id',
				'repositories.owner_login',
				'repositories.name'
			])
			.where('comments.author_id', '=', found.user_id)
			.where('comments.created_at', '>=', new Date(now.getTime() - HISTORY_HORIZON_MS))
			.orderBy('comments.created_at')
			.execute()
	).map((row) => ({
		createdAt: new Date(row.created_at),
		repositoryId: row.repository_id,
		repositoryOwnerId: row.owner_id,
		threadAuthorId: row.author_id,
		authorAssociation: row.author_association,
		answerable: row.category_answerable,
		body: row.body,
		repository: `${row.owner_login}/${row.name}`,
		url: threadUrl(row.owner_login, row.name, row.kind, row.number),
		kind: row.kind,
		category: row.category_name
	}));

	const commentsHere = rows
		.filter((row) => row.repositoryOwnerId === installation.accountId)
		.reverse()
		.map(evidence);
	const outward = outwardComments(found.user_id, rows);
	const burst = findBurst(outward, DAY, BURST_MIN_REPOS).map(evidence);

	const decisions = await db
		.selectFrom('decisions')
		.innerJoin('github_users', 'github_users.id', 'decisions.actor_id')
		.leftJoin('outbox', 'outbox.decision_id', 'decisions.id')
		.select([
			'decisions.action',
			'decisions.decided_at',
			'github_users.login',
			'outbox.status',
			'outbox.last_error'
		])
		.where('decisions.case_id', '=', found.case_id)
		.orderBy('decisions.decided_at', 'desc')
		.execute();

	const rules = RULESET.rules.map((rule) => ({
		name: rule.name,
		signal: rule.signal,
		value: values.get(rule.signal) ?? 0,
		atLeast: rule.atLeast,
		fired: fired.has(rule.name)
	}));

	return {
		login: found.login,
		accountCreatedAt: found.account_created_at ? new Date(found.account_created_at) : null,
		followers: found.followers,
		caseId: found.case_id,
		state: found.state,
		score: found.score,
		evaluatedAt: evaluation ? new Date(evaluation.evaluated_at) : null,
		dataAsOf: evaluation ? new Date(evaluation.data_as_of) : null,
		rules,
		commentsHere,
		activity: dailyActivity(outward, now),
		burst,
		decisions: decisions.map((d) => ({
			action: d.action,
			actor: d.login,
			decidedAt: new Date(d.decided_at),
			outcome: d.status ? { status: d.status, error: d.last_error } : null
		})),
		reportUrl: reportUrl(found.login),
		reportSummary: summary(found.login, installation.login, rules, burst)
	};
}

function evidence(row: Row): EvidenceComment {
	return {
		body: row.body,
		createdAt: row.createdAt,
		repository: row.repository,
		url: row.url,
		kind: row.kind,
		category: row.category,
		answerable: row.answerable
	};
}

function dailyActivity(comments: ActivityComment[], now: Date) {
	const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
		const day = new Date(now.getTime() - (ACTIVITY_DAYS - 1 - i) * DAY);
		return { day: day.toISOString().slice(0, 10), comments: 0 };
	});
	const index = new Map(days.map((d, i) => [d.day, i]));
	for (const comment of comments) {
		const i = index.get(comment.createdAt.toISOString().slice(0, 10));
		if (i !== undefined) {
			days[i].comments++;
		}
	}
	return days;
}

/** Plain-text evidence to paste into GitHub's report form. */
function summary(
	login: string,
	org: string,
	rules: ExplainedRule[],
	burst: EvidenceComment[]
): string {
	const lines = [
		`The account ${login} appears to post automated (LLM-generated) comments across many unrelated repositories, including ${org}.`,
		'',
		...rules
			.filter((rule) => rule.fired)
			.map((rule) => `- ${describeRule(rule.signal, rule.value)}`),
		''
	];
	if (burst.length > 0) {
		lines.push('Burst of comments:');
		for (const comment of burst) {
			lines.push(`- ${comment.createdAt.toISOString()} ${comment.url}`);
		}
	}
	return lines.join('\n');
}

export interface Stat {
	signal: SignalName;
	value: string;
	label: string;
	fired: boolean;
}

/** The ruleset's signals as short tiles, in rule order, marking those that counted towards the score. */
export function stats(values: Partial<Record<SignalName, number>>): Stat[] {
	const signals = values as Record<SignalName, number>;
	const fired = new Set(
		score(
			RULESET,
			Object.entries(signals).map(([name, value]) => ({
				name: name as SignalName,
				version: 1,
				value
			}))
		).fired.map((rule) => rule.signal)
	);
	return RULESET.rules.map(({ signal }) => {
		const value = signals[signal] ?? 0;
		const percent = `${Math.round(value * 100)}%`;
		const [shown, label] = {
			peak_repos_24h: [String(value), 'repos within 24h'],
			peak_repos_1m: [String(value), 'repos within a minute'],
			qa_share: [percent, 'answers overall'],
			qa_share_burst: [percent, 'answers in a burst']
		}[signal];
		return { signal, value: shown, label, fired: fired.has(signal) };
	});
}

export function describeRule(signal: SignalName, value: number): string {
	switch (signal) {
		case 'peak_repos_24h':
			return `${value} different repositories within 24 hours`;
		case 'peak_repos_1m':
			return `${value} different repositories within one minute`;
		case 'qa_share':
			return `${Math.round(value * 100)}% of comments are answers in Q&A discussions`;
		case 'qa_share_burst':
			return `${Math.round(value * 100)}% answers in its busiest multi-repository burst`;
	}
}
