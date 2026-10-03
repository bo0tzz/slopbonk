import type { Db } from '../db';
import {
	EXEMPT_ASSOCIATIONS,
	HISTORY_FRESHNESS_MS,
	HISTORY_HORIZON_MS,
	QUEUE_THRESHOLD,
	RECHECK_OFFSETS_MS,
	REOPEN_SCORE_MARGIN
} from '../constants';
import { evaluateQueue, fetchHistoryQueue, jobKey, type AccountInInstallation } from '../jobs';
import type { JobSender } from '../queue';
import { RULESET, score, type Ruleset } from '../scoring/rules';
import { computeSignals } from '../scoring/signals';
import {
	findActivity,
	findInstallation,
	findTenantComments,
	findTracking,
	saveEvaluation
} from './store';

export type EvaluateResult =
	'skipped' | 'exempt' | 'awaiting-history' | 'gone' | { score: number; caseId: number | null };

export async function evaluate(
	db: Db,
	queue: JobSender,
	job: AccountInInstallation,
	now = new Date(),
	ruleset: Ruleset = RULESET
): Promise<EvaluateResult> {
	const installation = await findInstallation(db, job.installationId);
	if (!installation || installation.uninstalled_at) {
		return 'skipped';
	}

	const tenantComments = await findTenantComments(db, job.userId, installation.account_id);
	if (tenantComments.length === 0) {
		return 'skipped';
	}
	if (tenantComments.some((c) => EXEMPT_ASSOCIATIONS.includes(c.author_association))) {
		return 'exempt';
	}

	const tracking = await findTracking(db, job.userId);
	if (tracking?.gone_at) {
		return 'gone';
	}
	const lastFetched = tracking?.last_fetched_at ? new Date(tracking.last_fetched_at) : null;
	if (!lastFetched || now.getTime() - lastFetched.getTime() >= HISTORY_FRESHNESS_MS) {
		await queue.send(fetchHistoryQueue, job, { singletonKey: jobKey(job) });
		return 'awaiting-history';
	}

	const activity = await findActivity(db, job.userId, new Date(now.getTime() - HISTORY_HORIZON_MS));
	const signals = computeSignals(job.userId, activity);
	const result = score(ruleset, signals);

	const firstSeen = new Date(tenantComments[0].created_at);
	const caseId = await saveEvaluation(
		db,
		{
			userId: job.userId,
			evaluatedAt: now,
			rulesetVersion: ruleset.version,
			dataAsOf: lastFetched,
			signals
		},
		{
			installationId: job.installationId,
			userId: job.userId,
			score: result.total,
			firstSeen,
			lastSeen: new Date(tenantComments[tenantComments.length - 1].created_at),
			openAt: QUEUE_THRESHOLD,
			reopenMargin: REOPEN_SCORE_MARGIN
		}
	);
	await scheduleRechecks(queue, job, firstSeen, now);
	return { score: result.total, caseId };
}

/**
 * Re-checks are timed from the account's first comment in the tenant, and only those still ahead
 * are sent, so every evaluation can send them and the queue keeps one of each.
 */
async function scheduleRechecks(
	queue: JobSender,
	job: AccountInInstallation,
	firstSeen: Date,
	now: Date
) {
	for (const offset of RECHECK_OFFSETS_MS) {
		const at = new Date(firstSeen.getTime() + offset);
		if (at > now) {
			await queue.send(evaluateQueue, job, {
				singletonKey: `${jobKey(job)}:recheck:${offset}`,
				startAfter: at
			});
		}
	}
}
