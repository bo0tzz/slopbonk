import { getRequestEvent, query } from '$app/server';
import { isOperator } from '#lib/server/auth/access.js';
import { githubApp } from '#lib/server/env.js';
import { reviewableInstallations } from '#lib/server/review/installations.js';
import { getServices } from '#lib/server/services.js';

export const currentReviewer = query(async () => {
	const { reviewer } = getRequestEvent().locals;
	return reviewer ? { login: reviewer.login, operator: isOperator(reviewer) } : null;
});

export const reviewableOrgs = query(async () => {
	const { reviewer } = getRequestEvent().locals;
	return {
		installUrl: `https://github.com/apps/${githubApp().slug}/installations/new`,
		orgs: reviewer ? await reviewableInstallations(getServices().db, reviewer.installationIds) : []
	};
});
