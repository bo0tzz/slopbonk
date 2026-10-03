import { error, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { form, getRequestEvent, query } from '$app/server';
import { installationForReviewer } from '$lib/server/auth/access';
import { accountEvidence } from '$lib/server/review/account';
import { MAX_SCORE } from '$lib/server/review/stats';
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
			installationId: target.id,
			canBlock: target.accountType === 'Organization',
			maxScore: MAX_SCORE,
			counts,
			entries
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
			installationId: target.id,
			canBlock: target.accountType === 'Organization',
			...evidence
		};
	}
);

export const decide = form(
	v.object({
		org: v.string(),
		caseId: v.pipe(v.string(), v.transform(Number), v.integer()),
		action: v.picklist(['block', 'dismiss']),
		hideComments: v.optional(
			v.pipe(
				v.picklist(['yes', 'no']),
				v.transform((value) => value === 'yes')
			)
		),
		/** Where to go afterwards: the next account to review, or back to the queue. */
		then: v.picklist(['next', 'queue'])
	}),
	async ({ org, caseId, action, hideComments, then }) => {
		const { db, queue } = getServices();
		const { locals } = getRequestEvent();
		const target = await installation(org);
		try {
			await recordDecision(db, queue, {
				installationId: target.id,
				caseId,
				actor: { id: locals.reviewer!.id, login: locals.reviewer!.login },
				action,
				hideComments
			});
		} catch (cause) {
			if (cause instanceof DecisionError) {
				error(400, cause.message);
			}
			throw cause;
		}
		const next = then === 'next' ? await nextToReview(db, target.id, caseId) : null;
		redirect(303, next ? `/orgs/${target.login}/accounts/${next}` : `/orgs/${target.login}`);
	}
);
