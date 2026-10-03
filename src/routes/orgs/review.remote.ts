import { error, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, getRequestEvent, query } from '$app/server';
import { installationForReviewer } from '$lib/server/auth/access';
import { accountEvidence, describeRule } from '$lib/server/review/account';
import { DecisionError, recordDecision } from '$lib/server/review/decisions';
import { listQueue, nextToReview, queueCounts } from '$lib/server/review/queue';
import { getServices } from '$lib/server/services';

async function installation(org: string) {
	const { locals } = getRequestEvent();
	const found = await installationForReviewer(getServices().db, locals.reviewer, org);
	if (!found) {
		error(404, 'Not found');
	}
	return found;
}

export const orgQueue = query(
	v.object({ org: v.string(), tab: v.picklist(['review', 'blocked', 'dismissed']) }),
	async ({ org, tab }) => {
		const { db } = getServices();
		const target = await installation(org);
		const [counts, entries] = await Promise.all([
			queueCounts(db, target.id),
			listQueue(db, target, tab)
		]);
		return {
			org: target.login,
			counts,
			entries: entries.map((entry) => ({
				...entry,
				reasons: Object.entries(entry.signals).map(([signal, value]) =>
					describeRule(signal as Parameters<typeof describeRule>[0], value)
				)
			}))
		};
	}
);

export const flaggedAccount = query(
	v.object({ org: v.string(), login: v.string() }),
	async ({ org, login }) => {
		const target = await installation(org);
		const evidence = await accountEvidence(getServices().db, target, login);
		if (!evidence) {
			error(404, 'Not found');
		}
		return {
			org: target.login,
			canBlock: target.accountType === 'Organization',
			...evidence,
			rules: evidence.rules.map((rule) => ({
				...rule,
				description: describeRule(rule.signal, rule.value)
			}))
		};
	}
);

export const decide = form(
	v.object({
		org: v.string(),
		caseId: v.pipe(v.string(), v.transform(Number), v.integer()),
		action: v.picklist(['block', 'dismiss'])
	}),
	async ({ org, caseId, action }) => {
		const { db, queue } = getServices();
		const { locals } = getRequestEvent();
		const target = await installation(org);
		try {
			await recordDecision(db, queue, {
				installationId: target.id,
				caseId,
				actorId: locals.reviewer!.id,
				action
			});
		} catch (cause) {
			if (cause instanceof DecisionError) {
				error(400, cause.message);
			}
			throw cause;
		}
		const next = await nextToReview(db, target, caseId);
		redirect(303, next ? `/orgs/${target.login}/accounts/${next}` : `/orgs/${target.login}`);
	}
);
