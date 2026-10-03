import { HISTORY_HORIZON_MS } from '../constants';
import type { Db } from '../db';
import type { CaseState } from '../db/schema/tables/case.table';
import type { OutboxStatus } from '../db/schema/tables/outbox.table';
import type { ThreadKind } from '../db/schema/tables/thread.table';
import {
	BURST_MIN_REPOS,
	DAY,
	findBurst,
	outwardComments,
	type ActivityComment,
	type SignalName
} from '../scoring/signals';
import { reportUrl, threadUrl } from './links';
import { MAX_SCORE, stats, type Stat } from './stats';

const ACTIVITY_DAYS = 30;

export interface EvidenceComment {
	id: string;
	body: string;
	createdAt: Date;
	repository: string;
	url: string;
	kind: ThreadKind;
	category: string | null;
	answerable: boolean;
}

export interface ActionOutcome {
	status: OutboxStatus;
	error: string | null;
}

export interface AccountEvidence {
	userId: number;
	login: string;
	accountCreatedAt: Date | null;
	/** When GitHub stopped returning the account: deleted or suspended. */
	goneAt: Date | null;
	followers: number | null;
	caseId: number;
	state: CaseState;
	score: number;
	maxScore: number;
	evaluatedAt: Date | null;
	dataAsOf: Date | null;
	stats: Stat[];
	/** Newest first, each with its earlier versions, newest first. */
	commentsHere: (EvidenceComment & { edits: { body: string; replacedAt: Date }[] })[];
	/** Outward comments per day for the last 30 days, oldest first. */
	activity: { day: string; comments: number }[];
	burst: EvidenceComment[];
	decisions: {
		action: string;
		actor: string;
		decidedAt: Date;
		/** How far the decision's GitHub actions have got; null for a block not asked for. */
		block: ActionOutcome | null;
		hidden: (ActionOutcome & { total: number }) | null;
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
		.leftJoin('tracked_users', 'tracked_users.user_id', 'cases.user_id')
		.select([
			'tracked_users.gone_at',
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
	const shown = stats(
		Object.fromEntries(signals.map((s) => [s.signal_name as SignalName, s.value]))
	);

	const rows: Row[] = (
		await db
			.selectFrom('comments')
			.innerJoin('threads', 'threads.id', 'comments.thread_id')
			.innerJoin('repositories', 'repositories.id', 'threads.repository_id')
			.select([
				'comments.id',
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
		id: row.id,
		body: row.body,
		repository: `${row.owner_login}/${row.name}`,
		url: threadUrl(row.owner_login, row.name, row.kind, row.number),
		kind: row.kind,
		category: row.category_name
	}));

	const here = rows.filter((row) => row.repositoryOwnerId === installation.accountId).reverse();
	const edits = here.length
		? await db
				.selectFrom('comment_edits')
				.select(['comment_id', 'body', 'edited_at'])
				.where(
					'comment_id',
					'in',
					here.map((row) => row.id)
				)
				.orderBy('edited_at', 'desc')
				.execute()
		: [];
	const commentsHere = here.map((row) => ({
		...evidence(row),
		edits: edits
			.filter((edit) => edit.comment_id === row.id)
			.map((edit) => ({ body: edit.body, replacedAt: new Date(edit.edited_at) }))
	}));
	const outward = outwardComments(found.user_id, rows);
	const burst = findBurst(outward, DAY, BURST_MIN_REPOS).map(evidence);

	const decisions = await db
		.selectFrom('decisions')
		.innerJoin('github_users', 'github_users.id', 'decisions.actor_id')
		.select(['decisions.id', 'decisions.action', 'decisions.decided_at', 'github_users.login'])
		.where('decisions.case_id', '=', found.case_id)
		.orderBy('decisions.decided_at', 'desc')
		.execute();
	const outbox = decisions.length
		? await db
				.selectFrom('outbox')
				.select(['decision_id', 'action', 'status', 'last_error'])
				.where(
					'decision_id',
					'in',
					decisions.map((d) => d.id)
				)
				.execute()
		: [];

	return {
		userId: found.user_id,
		login: found.login,
		accountCreatedAt: found.account_created_at ? new Date(found.account_created_at) : null,
		goneAt: found.gone_at ? new Date(found.gone_at) : null,
		followers: found.followers,
		caseId: found.case_id,
		state: found.state,
		score: found.score,
		maxScore: MAX_SCORE,
		evaluatedAt: evaluation ? new Date(evaluation.evaluated_at) : null,
		dataAsOf: evaluation ? new Date(evaluation.data_as_of) : null,
		stats: shown,
		commentsHere,
		activity: dailyActivity(outward, now),
		burst,
		decisions: decisions.map((d) => {
			const items = outbox.filter((item) => item.decision_id === d.id);
			const block = items.find((item) => item.action === 'block_user');
			const hides = items.filter((item) => item.action === 'minimize_comment');
			return {
				action: d.action,
				actor: d.login,
				decidedAt: new Date(d.decided_at),
				block: block ? { status: block.status, error: block.last_error } : null,
				hidden: hides.length ? { total: hides.length, ...overall(hides) } : null
			};
		}),
		reportUrl: reportUrl(found.login),
		reportSummary: summary(found.login, installation.login, shown, burst)
	};
}

/** Pending until all are done; failed, with the first error, if any failed. */
function overall(items: { status: OutboxStatus; last_error: string | null }[]): ActionOutcome {
	const failed = items.find((item) => item.status === 'failed');
	if (failed) {
		return { status: 'failed', error: failed.last_error };
	}
	return {
		status: items.every((item) => item.status === 'done') ? 'done' : 'pending',
		error: null
	};
}

function evidence(row: Row): EvidenceComment {
	return {
		id: row.id,
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
function summary(login: string, org: string, shown: Stat[], burst: EvidenceComment[]): string {
	const lines = [
		`The account ${login} appears to post automated (LLM-generated) comments across many unrelated repositories, including ${org}.`,
		'',
		...shown.filter((stat) => stat.fired).map((stat) => `- ${stat.description}`),
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
